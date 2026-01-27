import 'dart:convert';

import 'package:csv/csv.dart';
import 'package:drift/drift.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../data/local_db.dart';
import '../data/sync_service.dart';

class StudentsScreen extends StatefulWidget {
  const StudentsScreen({
    super.key,
    required this.db,
    required this.syncService,
    required this.classId,
    required this.classTitle,
  });

  final LocalDatabase db;
  final SyncService syncService;
  final String classId;
  final String classTitle;

  @override
  State<StudentsScreen> createState() => _StudentsScreenState();
}

class _StudentsScreenState extends State<StudentsScreen> {
  final _uuid = const Uuid();
  List<Student> _students = [];
  bool _loading = true;
  String? _error;

  String get _userId => Supabase.instance.client.auth.currentSession?.user.id ?? '';

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    await _loadLocal();
    await _loadRemote();
  }

  Future<void> _loadLocal() async {
    if (_userId.isEmpty) return;
    final students = await widget.db.fetchStudents(_userId, widget.classId);
    if (mounted) {
      setState(() {
        _students = students;
        _loading = false;
      });
    }
  }

  Future<void> _loadRemote() async {
    if (_userId.isEmpty) return;
    final response = await Supabase.instance.client
        .from('students')
        .select('*')
        .eq('class_id', widget.classId)
        .is_('deleted_at', null)
        .order('roll_no');
    if (response.error != null) {
      setState(() => _error = response.error!.message);
      return;
    }
    final data = response.data as List<dynamic>;
    for (final record in data) {
      await widget.db.upsertStudent(StudentsCompanion.insert(
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
    await _loadLocal();
  }

  Future<void> _openCreateDialog() async {
    final formKey = GlobalKey<FormState>();
    String rollNo = '';
    String name = '';
    String email = '';
    String phone = '';

    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(context).viewInsets.bottom + 20,
          ),
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Add student', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                TextFormField(
                  decoration: const InputDecoration(labelText: 'Roll number'),
                  onSaved: (value) => rollNo = value?.trim() ?? '',
                ),
                TextFormField(
                  decoration: const InputDecoration(labelText: 'Name'),
                  onSaved: (value) => name = value?.trim() ?? '',
                  validator: (value) => value == null || value.isEmpty ? 'Required' : null,
                ),
                TextFormField(
                  decoration: const InputDecoration(labelText: 'Email'),
                  onSaved: (value) => email = value?.trim() ?? '',
                ),
                TextFormField(
                  decoration: const InputDecoration(labelText: 'Phone'),
                  onSaved: (value) => phone = value?.trim() ?? '',
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () {
                    if (formKey.currentState?.validate() ?? false) {
                      formKey.currentState?.save();
                      Navigator.pop(context, true);
                    }
                  },
                  child: const Text('Save'),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (result == true) {
      await _createStudent(rollNo, name, email, phone);
    }
  }

  Future<void> _createStudent(
      String rollNo, String name, String email, String phone) async {
    final now = DateTime.now().toUtc().toIso8601String();
    final id = _uuid.v4();
    final payload = {
      'id': id,
      'owner_id': _userId,
      'class_id': widget.classId,
      'roll_no': rollNo.isEmpty ? null : rollNo,
      'name': name,
      'email': email.isEmpty ? null : email,
      'phone': phone.isEmpty ? null : phone,
      'created_at': now,
      'updated_at': now,
      'deleted_at': null,
    };

    await widget.db.upsertStudent(StudentsCompanion.insert(
      id: id,
      ownerId: _userId,
      classId: widget.classId,
      rollNo: Value(rollNo.isEmpty ? null : rollNo),
      name: name,
      email: Value(email.isEmpty ? null : email),
      phone: Value(phone.isEmpty ? null : phone),
      createdAt: now,
      updatedAt: now,
      deletedAt: const Value(null),
    ));

    try {
      final response = await Supabase.instance.client.from('students').upsert(payload);
      if (response.error != null) throw response.error!;
    } catch (_) {
      await widget.db.queueOutbox(
        tableName: 'students',
        action: 'insert',
        recordId: id,
        payload: payload,
        createdAt: now,
      );
    }

    await _loadLocal();
  }

  Future<void> _importCsv() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['csv'],
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    if (file.bytes == null) return;

    final csv = const Utf8Decoder().convert(file.bytes!);
    final rows = const CsvToListConverter().convert(csv);
    if (rows.length < 2) {
      setState(() => _error = 'CSV must include header and at least one row.');
      return;
    }
    final header = rows.first.map((e) => e.toString().trim().toLowerCase()).toList();
    final required = ['roll_no', 'name', 'email', 'phone'];
    for (final field in required) {
      if (!header.contains(field)) {
        setState(() => _error = 'Missing column: $field');
        return;
      }
    }
    final now = DateTime.now().toUtc().toIso8601String();
    for (int i = 1; i < rows.length; i++) {
      final row = rows[i];
      if (row.isEmpty) continue;
      final record = <String, dynamic>{};
      for (final field in required) {
        final idx = header.indexOf(field);
        record[field] = idx >= 0 && idx < row.length ? row[idx].toString().trim() : null;
      }
      final id = _uuid.v4();
      final payload = {
        'id': id,
        'owner_id': _userId,
        'class_id': widget.classId,
        'roll_no': record['roll_no']?.isEmpty == true ? null : record['roll_no'],
        'name': record['name'] ?? '',
        'email': record['email']?.isEmpty == true ? null : record['email'],
        'phone': record['phone']?.isEmpty == true ? null : record['phone'],
        'created_at': now,
        'updated_at': now,
        'deleted_at': null,
      };

      await widget.db.upsertStudent(StudentsCompanion.insert(
        id: id,
        ownerId: _userId,
        classId: widget.classId,
        rollNo: Value(payload['roll_no'] as String?),
        name: payload['name'] as String,
        email: Value(payload['email'] as String?),
        phone: Value(payload['phone'] as String?),
        createdAt: now,
        updatedAt: now,
        deletedAt: const Value(null),
      ));

      try {
        final response = await Supabase.instance.client.from('students').upsert(payload);
        if (response.error != null) throw response.error!;
      } catch (_) {
        await widget.db.queueOutbox(
          tableName: 'students',
          action: 'insert',
          recordId: id,
          payload: payload,
          createdAt: now,
        );
      }
    }

    await _loadLocal();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${widget.classTitle} · Students'),
        actions: [
          IconButton(onPressed: _importCsv, icon: const Icon(Icons.upload_file)),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openCreateDialog,
        label: const Text('Add student'),
        icon: const Icon(Icons.person_add),
      ),
      body: RefreshIndicator(
        onRefresh: _loadAll,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_error != null)
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            if (_loading) const Center(child: CircularProgressIndicator()),
            if (!_loading && _students.isEmpty)
              const Text('No students yet. Add or import a CSV.'),
            ..._students.map((student) => Card(
                  child: ListTile(
                    title: Text(student.name),
                    subtitle: Text(
                        'Roll ${student.rollNo ?? '—'} · ${student.email ?? 'No email'}'),
                  ),
                )),
          ],
        ),
      ),
    );
  }
}
