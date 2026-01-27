# Attendance System (Web + Android + Supabase)

This monorepo contains a brand-new Attendance System with:
- Web app: Next.js + Tailwind + Supabase JS + Dexie (offline cache)
- Android app: Flutter + Material 3 + supabase_flutter + Drift (offline cache)
- Supabase SQL schema + RLS policies

## Supabase Setup
1. Create a Supabase project.
2. In the SQL editor, run:
   - `supabase/schema.sql`
   - `supabase/rls.sql`
   - `supabase/seed.sql` (optional)
3. Grab your project URL + anon key for the clients.

## Web App (apps/web)
1. `cd apps/web`
2. `copy .env.local.example .env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Install and run:
   - `npm install`
   - `npm run dev`
4. Open `http://localhost:3000`.

## Android App (apps/android)
1. Install Flutter SDK and Android tooling.
2. `cd apps/android`
3. Get packages:
   - `flutter pub get`
4. Generate Drift files:
   - `flutter pub run build_runner build --delete-conflicting-outputs`
5. Run on a phone (USB debugging enabled):
   - `flutter devices`
   - `flutter run --dart-define=SUPABASE_URL=YOUR_URL --dart-define=SUPABASE_ANON_KEY=YOUR_KEY`

If you need a full Flutter platform scaffold (android/ios), run this once:
- `flutter create .`

## Troubleshooting
- **Missing Supabase env vars**: ensure `.env.local` (web) or `--dart-define` (Android) are set.
- **RLS blocking inserts**: make sure `owner_id` is set to the authenticated user ID on insert.
- **Email confirmation**: Supabase may require email confirmation; check your inbox.
- **Offline sync**: use the "Sync now" button once back online to push queued changes.
