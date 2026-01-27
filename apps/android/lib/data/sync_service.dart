import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import 'local_db.dart';

class SyncService {
  SyncService({required this.db, required this.client});

  final LocalDatabase db;
  final SupabaseClient client;

  static const _metaLastSync = 'last_sync';
  static const _metaDeviceId = 'device_id';

  String _nowIso() => DateTime.now().toUtc().toIso8601String();

  Future<void> ensureMeta() async {
    final device = await (db.select(db.meta)..where((tbl) => tbl.key.equals(_metaDeviceId)))
        .getSingleOrNull();
    if (device == null) {
      await db.into(db.meta).insertOnConflictUpdate(MetaCompanion.insert(
            key: _metaDeviceId,
            value: const Uuid().v4(),
          ));
      await db.into(db.meta).insertOnConflictUpdate(MetaCompanion.insert(
            key: _metaLastSync,
            value: DateTime.fromMillisecondsSinceEpoch(0).toUtc().toIso8601String(),
          ));
    }
  }

  Future<String> getLastSync() async {
    final record = await (db.select(db.meta)..where((tbl) => tbl.key.equals(_metaLastSync)))
        .getSingleOrNull();
    return record?.value ?? DateTime.fromMillisecondsSinceEpoch(0).toUtc().toIso8601String();
  }

  Future<void> setLastSync(String value) async {
    await db.into(db.meta).insertOnConflictUpdate(MetaCompanion.insert(
          key: _metaLastSync,
          value: value,
        ));
  }

  Future<void> syncNow(String userId) async {
    await ensureMeta();
    final lastSync = await getLastSync();
    await _pushOutbox(userId);
    await _pullUpdates(lastSync);
    await setLastSync(_nowIso());
  }

  Future<void> _pushOutbox(String userId) async {
    final items = await (db.select(db.outbox)
          ..orderBy([(tbl) => OrderingTerm.asc(tbl.createdAt)]))
        .get();

    for (final item in items) {
      final payload = jsonDecode(item.payload) as Map<String, dynamic>;
      if (item.tableName == 'classes' || item.tableName == 'students') {
        if (item.action == 'delete') {
          final deletedAt = payload['deleted_at'] ?? _nowIso();
          final response = await client
              .from(item.tableName)
              .update({'deleted_at': deletedAt})
              .eq('id', item.recordId);
          if (response.error != null) break;
        } else {
          final response =
              await client.from(item.tableName).upsert({...payload, 'owner_id': userId});
          if (response.error != null) break;
        }
      }
      await (db.delete(db.outbox)..where((tbl) => tbl.id.equals(item.id))).go();
    }
  }

  bool _isRemoteNewer(String remoteUpdatedAt, String? localUpdatedAt) {
    if (localUpdatedAt == null) return true;
    return DateTime.parse(remoteUpdatedAt).isAfter(DateTime.parse(localUpdatedAt)) ||
        DateTime.parse(remoteUpdatedAt).isAtSameMomentAs(DateTime.parse(localUpdatedAt));
  }

  Future<void> _pullUpdates(String lastSync) async {
    final classesResponse =
        await client.from('classes').select('*').gt('updated_at', lastSync);
    if (classesResponse.error == null) {
      final classes = classesResponse.data as List<dynamic>;
      for (final record in classes) {
        final existing = await (db.select(db.classes)
              ..where((tbl) => tbl.id.equals(record['id'] as String)))
            .getSingleOrNull();
        if (_isRemoteNewer(record['updated_at'] as String, existing?.updatedAt)) {
          await db.upsertClass(ClassesCompanion.insert(
            id: record['id'] as String,
            ownerId: record['owner_id'] as String,
            subjectName: record['subject_name'] as String,
            semester: record['semester'] as String,
            section: record['section'] as String,
            academicYear: record['academic_year'] as String,
            createdAt: record['created_at'] as String,
            updatedAt: record['updated_at'] as String,
            deletedAt: Value(record['deleted_at'] as String?),
          ));
        }
      }
    }

    final studentsResponse =
        await client.from('students').select('*').gt('updated_at', lastSync);
    if (studentsResponse.error == null) {
      final students = studentsResponse.data as List<dynamic>;
      for (final record in students) {
        final existing = await (db.select(db.students)
              ..where((tbl) => tbl.id.equals(record['id'] as String)))
            .getSingleOrNull();
        if (_isRemoteNewer(record['updated_at'] as String, existing?.updatedAt)) {
          await db.upsertStudent(StudentsCompanion.insert(
            id: record['id'] as String,
            ownerId: record['owner_id'] as String,
            classId: record['class_id'] as String,
            rollNo: Value(record['roll_no'] as String?),
            name: record['name'] as String,
            email: Value(record['email'] as String?),
            phone: Value(record['phone'] as String?),
            createdAt: record['created_at'] as String,
            updatedAt: record['updated_at'] as String,
            deletedAt: Value(record['deleted_at'] as String?),
          ));
        }
      }
    }
  }
}
