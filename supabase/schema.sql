-- Supabase schema for Attendance System
-- Requires pgcrypto for gen_random_uuid()
create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  subject_name text not null,
  semester text not null,
  section text not null,
  academic_year text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz null
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  class_id uuid not null references public.classes(id) on delete cascade,
  roll_no text,
  name text not null,
  email text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz null
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  class_id uuid not null references public.classes(id) on delete cascade,
  date date not null,
  time_slot text not null,
  period_count int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz null,
  unique (class_id, date, time_slot)
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null check (status in ('P', 'A')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz null,
  unique (session_id, student_id)
);

create index if not exists classes_owner_id_idx on public.classes(owner_id);
create index if not exists classes_deleted_at_idx on public.classes(deleted_at);

create index if not exists students_owner_id_idx on public.students(owner_id);
create index if not exists students_class_id_idx on public.students(class_id);
create index if not exists students_deleted_at_idx on public.students(deleted_at);

create index if not exists sessions_owner_id_idx on public.attendance_sessions(owner_id);
create index if not exists sessions_class_id_idx on public.attendance_sessions(class_id);
create index if not exists sessions_date_idx on public.attendance_sessions(date);
create index if not exists sessions_deleted_at_idx on public.attendance_sessions(deleted_at);

create index if not exists records_owner_id_idx on public.attendance_records(owner_id);
create index if not exists records_session_id_idx on public.attendance_records(session_id);
create index if not exists records_student_id_idx on public.attendance_records(student_id);
create index if not exists records_deleted_at_idx on public.attendance_records(deleted_at);

drop trigger if exists set_updated_at_classes on public.classes;
create trigger set_updated_at_classes
before update on public.classes
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_students on public.students;
create trigger set_updated_at_students
before update on public.students
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_sessions on public.attendance_sessions;
create trigger set_updated_at_sessions
before update on public.attendance_sessions
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_records on public.attendance_records;
create trigger set_updated_at_records
before update on public.attendance_records
for each row execute procedure public.set_updated_at();
