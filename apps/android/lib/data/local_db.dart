import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'local_db.g.dart';

class Classes extends Table {
  TextColumn get id => text()();
  TextColumn get ownerId => text()();
  TextColumn get subjectName => text()();
  TextColumn get semester => text()();
  TextColumn get section => text()();
  TextColumn get academicYear => text()();
  TextColumn get createdAt => text()();
  TextColumn get updatedAt => text()();
  TextColumn get deletedAt => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class Students extends Table {
  TextColumn get id => text()();
  TextColumn get ownerId => text()();
  TextColumn get classId => text()();
  TextColumn get rollNo => text().nullable()();
  TextColumn get name => text()();
  TextColumn get email => text().nullable()();
  TextColumn get phone => text().nullable()();
  TextColumn get createdAt => text()();
  TextColumn get updatedAt => text()();
  TextColumn get deletedAt => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class Outbox extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get tableName => text()();
  TextColumn get action => text()();
  TextColumn get recordId => text()();
  TextColumn get payload => text()();
  TextColumn get createdAt => text()();
}

class Meta extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {key};
}

@DriftDatabase(tables: [Classes, Students, Outbox, Meta])
class LocalDatabase extends _$LocalDatabase {
  LocalDatabase() : super(FlutterQueryExecutor.inDatabaseFolder(path: 'attendance.db'));

  @override
  int get schemaVersion => 1;

  Future<void> upsertClass(ClassesCompanion entry) async {
    await into(classes).insertOnConflictUpdate(entry);
  }

  Future<void> upsertStudent(StudentsCompanion entry) async {
    await into(students).insertOnConflictUpdate(entry);
  }

  Future<List<Class>> fetchClasses(String ownerId) {
    return (select(classes)
          ..where((tbl) => tbl.ownerId.equals(ownerId) & tbl.deletedAt.isNull()))
        .get();
  }

  Future<List<Student>> fetchStudents(String ownerId, String classId) {
    return (select(students)
          ..where((tbl) =>
              tbl.ownerId.equals(ownerId) & tbl.classId.equals(classId) & tbl.deletedAt.isNull()))
        .get();
  }

  Future<int> pendingOutboxCount() async {
    final countExp = outbox.id.count();
    final query = selectOnly(outbox)..addColumns([countExp]);
    final row = await query.getSingle();
    return row.read(countExp) ?? 0;
  }

  Future<void> queueOutbox({
    required String tableName,
    required String action,
    required String recordId,
    required Map<String, dynamic> payload,
    required String createdAt,
  }) async {
    await into(outbox).insert(OutboxCompanion.insert(
      tableName: tableName,
      action: action,
      recordId: recordId,
      payload: jsonEncode(payload),
      createdAt: createdAt,
    ));
  }
}
