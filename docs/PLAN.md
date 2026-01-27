# Attendance System Plan

## Phase 1: Auth + Online CRUD + Basic Attendance
- Supabase Auth with teacher accounts.
- Core tables: classes, students, attendance sessions, attendance records.
- Web: login + classes CRUD, students CRUD.
- Android: login + classes list/create, students list/create.

## Phase 2: Offline Outbox + Sync
- Local databases (Dexie on web, Drift on Android).
- Outbox tables for queued mutations.
- Sync engine: push outbox, pull updated rows, last-write-wins.
- Sync status UI (online/offline, last sync, pending changes).

## Phase 3: Analytics + Exports + Realtime
- Attendance percentage reports with color coding.
- Monthly matrix summary + consecutive absentees.
- CSV exports and share flows.
- Optional realtime subscriptions.
