-- Supabase schema for LenziAI.
-- This file is intentionally close to the existing SQLite schema so the API can
-- be switched to Supabase without rewriting the clinical workflow.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  username text not null unique,
  display_name text not null,
  role text not null default 'member' check (role in ('member','admin')),
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);

-- Existing installations: add the admin flag (default keeps everyone a member).
alter table profiles add column if not exists role
  text not null default 'member' check (role in ('member','admin'));
-- Existing installations: suspension flag used by the admin user management.
alter table profiles add column if not exists suspended boolean not null default false;
-- Remove the legacy manual-approval field on existing installations.
alter table profiles drop column if exists approved;

create or replace function public.handle_new_lab_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, username, display_name, role)
  values (
    new.id,
    lower(new.email),
    lower(split_part(new.email, '@', 1)) || '_' || left(new.id::text, 8),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_lab_profile on auth.users;
create trigger on_auth_user_created_lab_profile
  after insert on auth.users
  for each row execute function public.handle_new_lab_user();

create table if not exists patients (
  id text primary key,
  patient_number text not null unique,
  full_name text not null,
  full_name_index text,
  age integer not null default 0,
  gender text not null default 'Other',
  referring_doctor text,
  referring_facility text,
  clinical_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  active boolean not null default true
);

create index if not exists idx_patients_active_created on patients(active, created_at desc);
create index if not exists idx_patients_number on patients(patient_number);
create index if not exists idx_patients_name_index on patients(full_name_index);

create table if not exists samples (
  id text primary key,
  patient_id text not null references patients(id) on delete cascade,
  sample_type text not null,
  slide_label text not null,
  stain_method text not null default '',
  objective text not null default '40x',
  eyepiece text not null default '10x',
  total_magnification text not null default '400x',
  fields_examined integer not null default 1,
  field_area_mm2 real not null default 0,
  collection_datetime timestamptz not null default now(),
  image_path text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists idx_samples_patient on samples(patient_id);

create table if not exists analyses (
  id text primary key,
  sample_id text not null references samples(id) on delete cascade,
  model_id text not null default 'server-configured',
  status text not null default 'in_review'
    check (status in ('processing','in_review','confirmed','verified')),
  total_detections integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  initiated_by uuid references auth.users(id)
);

create index if not exists idx_analyses_sample on analyses(sample_id);
create index if not exists idx_analyses_status on analyses(status);

create table if not exists detections (
  id text primary key,
  analysis_id text not null references analyses(id) on delete cascade,
  class_name text not null,
  confidence real not null,
  x real not null,
  y real not null,
  width real not null,
  height real not null,
  confirmed boolean not null default false,
  rejected boolean not null default false,
  manual boolean not null default false,
  note text,
  adjudicated_by uuid references auth.users(id),
  adjudicated_at timestamptz
);

create index if not exists idx_detections_analysis on detections(analysis_id);

create table if not exists reports (
  id text primary key,
  report_number text not null unique,
  analysis_id text not null references analyses(id) on delete cascade,
  technologist_id uuid not null,
  technologist_name text not null,
  supervisor_name text,
  status text not null default 'pending_verification'
    check (status in ('draft','pending_verification','verified','released')),
  technologist_notes text,
  clinical_impression text,
  generated_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  released_at timestamptz,
  deleted_at timestamptz
);

create index if not exists idx_reports_analysis on reports(analysis_id);
create index if not exists idx_reports_visible on reports(deleted_at, generated_at desc);

create table if not exists audit_log (
  seq bigint generated by default as identity primary key,
  id text not null unique,
  timestamp timestamptz not null default now(),
  actor_id uuid references auth.users(id),
  actor_name text,
  action text not null,
  entity text,
  entity_id text,
  details text,
  prev_hash text not null default '',
  row_hash text not null default ''
);

create index if not exists idx_audit_actor on audit_log(actor_id);
create index if not exists idx_audit_entity on audit_log(entity, entity_id);

-- Clinical data is available only through the trusted API service role.
-- The browser anon key receives no table policies and cannot read or mutate PHI.
alter table profiles enable row level security;
alter table patients enable row level security;
alter table samples enable row level security;
alter table analyses enable row level security;
alter table detections enable row level security;
alter table reports enable row level security;
alter table audit_log enable row level security;
