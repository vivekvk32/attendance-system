import 'package:flutter/material.dart';
import 'package:drift/drift.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../data/local_db.dart';
import '../data/sync_service.dart';
import 'students_screen.dart';

class ClassesScreen extends StatefulWidget {
  const ClassesScreen({super.key, required this.db, required this.syncService});

  final LocalDatabase db;
  final SyncService syncService;

  @override
  State<ClassesScreen> createState() => _ClassesScreenState();
}

class _ClassesScreenState extends State<ClassesScreen> {
  final _uuid = const Uuid();
  List<Class> _classes = [];
  bool _loading = true;
  bool _syncing = false;
  String? _error;
  String? _lastSync;
  int _pending = 0;

  String get _userId => Supabase.instance.client.auth.currentSession?.user.id ?? '';

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    await _loadLocal();
    await _loadRemote();
    await _refreshSyncMeta();
  }

  Future<void> _loadLocal() async {
    if (_userId.isEmpty) return;
    final classes = await widget.db.fetchClasses(_userId);
    if (mounted) {
      setState(() {
        _classes = classes;
        _loading = false;
      });
    }
  }

  Future<void> _loadRemote() async {
    if (_userId.isEmpty) return;
    final response = await Supabase.instance.client
        .from('classes')
        .select('*')
        .eq('owner_id', _userId)
        .is_('deleted_at', null)
        .order('created_at');
    if (response.error != null) {
      setState(() => _error = response.error!.message);
      return;
    }
    final data = response.data as List<dynamic>;
    for (final record in data) {
      await widget.db.upsertClass(ClassesCompanion.insert(
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
    await _loadLocal();
  }

  Future<void> _refreshSyncMeta() async {
    final pending = await widget.db.pendingOutboxCount();
    final lastSync = await widget.syncService.getLastSync();
    if (mounted) {
      setState(() {
        _pending = pending;
        _lastSync = lastSync;
      });
    }
  }

  Future<void> _openCreateDialog() async {
    final formKey = GlobalKey<FormState>();
    String subject = '';
    String semester = '';
    String section = '';
    String year = '';

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
                Text('New class', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                TextFormField(
                  decoration: const InputDecoration(labelText: 'Subject name'),
                  onSaved: (value) => subject = value?.trim() ?? '',
                  validator: (value) => value == null || value.isEmpty ? 'Required' : null,
                ),
                TextFormField(
                  decoration: const InputDecoration(labelText: 'Semester'),
                  onSaved: (value) => semester = value?.trim() ?? '',
                  validator: (value) => value == null || value.isEmpty ? 'Required' : null,
                ),
                TextFormField(
                  decoration: const InputDecoration(labelText: 'Section/Batch'),
                  onSaved: (value) => section = value?.trim() ?? '',
                  validator: (value) => value == null || value.isEmpty ? 'Required' : null,
                ),
                TextFormField(
                  decoration: const InputDecoration(labelText: 'Academic year'),
                  onSaved: (value) => year = value?.trim() ?? '',
                  validator: (value) => value == null || value.isEmpty ? 'Required' : null,
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
      await _createClass(subject, semester, section, year);
    }
  }

  Future<void> _createClass(
      String subject, String semester, String section, String year) async {
    final now = DateTime.now().toUtc().toIso8601String();
    final id = _uuid.v4();
    final payload = {
      'id': id,
      'owner_id': _userId,
      'subject_name': subject,
      'semester': semester,
      'section': section,
      'academic_year': year,
      'created_at': now,
      'updated_at': now,
      'deleted_at': null,
    };

    await widget.db.upsertClass(ClassesCompanion.insert(
      id: id,
      ownerId: _userId,
      subjectName: subject,
      semester: semester,
      section: section,
      academicYear: year,
      createdAt: now,
      updatedAt: now,
      deletedAt: const Value(null),
    ));

    try {
      final response = await Supabase.instance.client.from('classes').upsert(payload);
      if (response.error != null) throw response.error!;
    } catch (_) {
      await widget.db.queueOutbox(
        tableName: 'classes',
        action: 'insert',
        recordId: id,
        payload: payload,
        createdAt: now,
      );
    }

    await _loadLocal();
    await _refreshSyncMeta();
  }

  Future<void> _syncNow() async {
    if (_userId.isEmpty) return;
    setState(() => _syncing = true);
    await widget.syncService.syncNow(_userId);
    await _loadLocal();
    await _refreshSyncMeta();
    if (mounted) {
      setState(() => _syncing = false);
    }
  }

  Future<void> _signOut() async {
    await Supabase.instance.client.auth.signOut();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Classes'),
        actions: [
          IconButton(onPressed: _syncing ? null : _syncNow, icon: const Icon(Icons.sync)),
          IconButton(onPressed: _signOut, icon: const Icon(Icons.logout)),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openCreateDialog,
        label: const Text('Add class'),
        icon: const Icon(Icons.add),
      ),
      body: RefreshIndicator(
        onRefresh: _loadAll,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _SyncStatusCard(lastSync: _lastSync, pending: _pending, syncing: _syncing),
            const SizedBox(height: 12),
            if (_error != null)
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            if (_loading) const Center(child: CircularProgressIndicator()),
            if (!_loading && _classes.isEmpty)
              const Text('No classes yet. Tap "Add class" to start.'),
            ..._classes.map((item) => Card(
                  child: ListTile(
                    title: Text(item.subjectName),
                    subtitle: Text('Sem ${item.semester} · ${item.section} · ${item.academicYear}'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => StudentsScreen(
                            db: widget.db,
                            syncService: widget.syncService,
                            classId: item.id,
                            classTitle: item.subjectName,
                          ),
                        ),
                      );
                    },
                  ),
                )),
          ],
        ),
      ),
    );
  }
}

class _SyncStatusCard extends StatelessWidget {
  const _SyncStatusCard({this.lastSync, required this.pending, required this.syncing});

  final String? lastSync;
  final int pending;
  final bool syncing;

  @override
  Widget build(BuildContext context) {
    final text = lastSync == null
        ? 'Never synced'
        : DateTime.parse(lastSync!).toLocal().toString();
    return Card(
      color: Theme.of(context).colorScheme.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(syncing ? Icons.sync : Icons.cloud, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Last sync: $text'),
                  Text('Pending changes: $pending'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
