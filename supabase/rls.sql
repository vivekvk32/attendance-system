-- Enable RLS and restrict rows to owner_id = auth.uid()

alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;

alter table public.classes force row level security;
alter table public.students force row level security;
alter table public.attendance_sessions force row level security;
alter table public.attendance_records force row level security;

drop policy if exists "classes_owner_all" on public.classes;
create policy "classes_owner_all"
on public.classes
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "students_owner_all" on public.students;
create policy "students_owner_all"
on public.students
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "sessions_owner_all" on public.attendance_sessions;
create policy "sessions_owner_all"
on public.attendance_sessions
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "records_owner_all" on public.attendance_records;
create policy "records_owner_all"
on public.attendance_records
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
