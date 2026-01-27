import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'data/local_db.dart';
import 'data/supabase_config.dart';
import 'data/sync_service.dart';
import 'screens/classes_screen.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (!SupabaseConfig.isConfigured) {
    runApp(const _MissingConfigApp());
    return;
  }

  await Supabase.initialize(
    url: SupabaseConfig.url,
    anonKey: SupabaseConfig.anonKey,
    authFlowType: AuthFlowType.pkce,
  );

  final db = LocalDatabase();
  final syncService = SyncService(db: db, client: Supabase.instance.client);

  runApp(AttendanceApp(db: db, syncService: syncService));
}

class AttendanceApp extends StatelessWidget {
  const AttendanceApp({super.key, required this.db, required this.syncService});

  final LocalDatabase db;
  final SyncService syncService;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Attendance System',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF346CF7)),
        useMaterial3: true,
      ),
      home: AuthGate(db: db, syncService: syncService),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key, required this.db, required this.syncService});

  final LocalDatabase db;
  final SyncService syncService;

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  Session? _session;
  late final Stream<AuthState> _authStream;

  @override
  void initState() {
    super.initState();
    _session = Supabase.instance.client.auth.currentSession;
    _authStream = Supabase.instance.client.auth.onAuthStateChange;
    _authStream.listen((data) {
      setState(() => _session = data.session);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_session == null) {
      return const LoginScreen();
    }
    return ClassesScreen(db: widget.db, syncService: widget.syncService);
  }
}

class _MissingConfigApp extends StatelessWidget {
  const _MissingConfigApp();

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: Scaffold(
        body: Center(
          child: Text('Missing SUPABASE_URL / SUPABASE_ANON_KEY.'),
        ),
      ),
    );
  }
}
