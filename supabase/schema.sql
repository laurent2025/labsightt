-- ============================================================
-- LABSIGHT - SUPABASE DATABASE SCHEMA
-- ============================================================
-- Authentication workflow:
--
-- 1. User registers through Supabase Auth.
-- 2. Supabase sends email confirmation.
-- 3. User confirms their email.
-- 4. A profile is automatically created with approved = false.
-- 5. Admin reviews and approves the account.
-- 6. User can access LabSight only when:
--       email_confirmed = true
--       AND approved = true
--
-- ============================================================

create extension if not exists pgcrypto;


-- ============================================================
-- PROFILES
-- ============================================================

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,

    email text not null unique,

    username text not null unique,

    display_name text not null,

    role text not null default 'user'
        check (role in ('user', 'admin')),

    approved boolean not null default false,

    approved_at timestamptz,

    approved_by uuid references auth.users(id),

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);


-- ============================================================
-- HANDLE EXISTING INSTALLATIONS
-- ============================================================

alter table public.profiles
    add column if not exists role text;

alter table public.profiles
    add column if not exists approved boolean;

alter table public.profiles
    add column if not exists approved_at timestamptz;

alter table public.profiles
    add column if not exists approved_by uuid;

alter table public.profiles
    add column if not exists updated_at timestamptz;

-- The pre-approval schema used role values 'member'/'admin' under an
-- auto-named 'profiles_role_check' constraint. This block replaces that
-- constraint with the 'user'/'admin' vocabulary, so both fresh and upgraded
-- installations end up with exactly one role check. The old constraint must
-- be dropped BEFORE the role values are remapped, or the remap itself
-- violates it.

alter table public.profiles
    drop constraint if exists profiles_role_check;

update public.profiles
set role = 'user'
where role = 'member';

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'profiles_role_check'
    ) then
        alter table public.profiles
        add constraint profiles_role_check
        check (role in ('user', 'admin'));
    end if;
end $$;

-- Set safe defaults for existing records

update public.profiles
set role = 'user'
where role is null;

update public.profiles
set approved = false
where approved is null;

update public.profiles
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;


-- Apply constraints after existing data has been normalized

alter table public.profiles
    alter column role set default 'user';

alter table public.profiles
    alter column role set not null;

alter table public.profiles
    alter column approved set default false;

alter table public.profiles
    alter column approved set not null;


-- Foreign key for approved_by

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'profiles_approved_by_fkey'
    ) then
        alter table public.profiles
        add constraint profiles_approved_by_fkey
        foreign key (approved_by)
        references auth.users(id);
    end if;
end $$;


-- ============================================================
-- NEW USER PROFILE TRIGGER
-- ============================================================

create or replace function public.handle_new_lab_user()

returns trigger

language plpgsql

security definer

set search_path = ''

as $$

begin

    insert into public.profiles (
        id,
        email,
        username,
        display_name,
        role,
        approved
    )

    values (
        new.id,

        lower(new.email),

        lower(split_part(new.email, '@', 1))
            || '_'
            || left(new.id::text, 8),

        coalesce(
            nullif(new.raw_user_meta_data ->> 'display_name', ''),
            split_part(new.email, '@', 1)
        ),

        'user',

        false
    )

    on conflict (id) do nothing;

    return new;

end;

$$;


-- ============================================================
-- AUTH USER CREATED TRIGGER
-- ============================================================

drop trigger if exists
on_auth_user_created_lab_profile
on auth.users;


create trigger
on_auth_user_created_lab_profile

after insert on auth.users

for each row

execute function public.handle_new_lab_user();


-- ============================================================
-- PROFILE UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.update_profile_updated_at()

returns trigger

language plpgsql

as $$

begin

    new.updated_at = now();

    return new;

end;

$$;


drop trigger if exists
profiles_updated_at_trigger
on public.profiles;


create trigger
profiles_updated_at_trigger

before update on public.profiles

for each row

execute function public.update_profile_updated_at();


-- ============================================================
-- PATIENTS
-- ============================================================

create table if not exists public.patients (

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


create index if not exists
idx_patients_active_created
on public.patients(active, created_at desc);


create index if not exists
idx_patients_number
on public.patients(patient_number);


create index if not exists
idx_patients_name_index
on public.patients(full_name_index);


-- ============================================================
-- SAMPLES
-- ============================================================

create table if not exists public.samples (

    id text primary key,

    patient_id text not null
        references public.patients(id)
        on delete cascade,

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


create index if not exists
idx_samples_patient
on public.samples(patient_id);


-- ============================================================
-- ANALYSES
-- ============================================================

create table if not exists public.analyses (

    id text primary key,

    sample_id text not null
        references public.samples(id)
        on delete cascade,

    model_id text not null default 'server-configured',

    status text not null default 'in_review'

        check (
            status in (
                'processing',
                'in_review',
                'confirmed',
                'verified'
            )
        ),

    total_detections integer not null default 0,

    started_at timestamptz not null default now(),

    completed_at timestamptz,

    initiated_by uuid references auth.users(id)
);


create index if not exists
idx_analyses_sample
on public.analyses(sample_id);


create index if not exists
idx_analyses_status
on public.analyses(status);


-- ============================================================
-- DETECTIONS
-- ============================================================

create table if not exists public.detections (

    id text primary key,

    analysis_id text not null
        references public.analyses(id)
        on delete cascade,

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


create index if not exists
idx_detections_analysis
on public.detections(analysis_id);


-- ============================================================
-- REPORTS
-- ============================================================

create table if not exists public.reports (

    id text primary key,

    report_number text not null unique,

    analysis_id text not null
        references public.analyses(id)
        on delete cascade,

    technologist_id uuid not null,

    technologist_name text not null,

    supervisor_name text,

    status text not null default 'pending_verification'

        check (
            status in (
                'draft',
                'pending_verification',
                'verified',
                'released'
            )
        ),

    technologist_notes text,

    clinical_impression text,

    generated_at timestamptz not null default now(),

    verified_at timestamptz,

    verified_by uuid references auth.users(id),

    released_at timestamptz,

    deleted_at timestamptz
);


create index if not exists
idx_reports_analysis
on public.reports(analysis_id);


create index if not exists
idx_reports_visible
on public.reports(deleted_at, generated_at desc);


-- ============================================================
-- AUDIT LOG
-- ============================================================

create table if not exists public.audit_log (

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


create index if not exists
idx_audit_actor
on public.audit_log(actor_id);


create index if not exists
idx_audit_entity
on public.audit_log(entity, entity_id);


-- ============================================================
-- ADMIN APPROVAL FUNCTION
-- ============================================================
-- Only an existing admin can approve another user.
--
-- Usage:
--
-- select public.approve_lab_user('USER-UUID-HERE');
--
-- ============================================================

create or replace function public.approve_lab_user(
    target_user_id uuid
)

returns void

language plpgsql

security definer

set search_path = public

as $$

declare
    current_role text;

begin

    -- Check current user's role

    select role
    into current_role

    from public.profiles

    where id = auth.uid();


    -- Only administrators can approve users

    if current_role <> 'admin' then

        raise exception 'Only administrators can approve users';

    end if;


    -- Approve target user

    update public.profiles

    set
        approved = true,
        approved_at = now(),
        approved_by = auth.uid(),
        updated_at = now()

    where id = target_user_id;


    if not found then

        raise exception 'User profile not found';

    end if;

end;

$$;


-- ============================================================
-- ADMIN REVOKE APPROVAL FUNCTION
-- ============================================================

create or replace function public.revoke_lab_user_approval(
    target_user_id uuid
)

returns void

language plpgsql

security definer

set search_path = public

as $$

declare
    current_role text;

begin

    select role
    into current_role

    from public.profiles

    where id = auth.uid();


    if current_role <> 'admin' then

        raise exception 'Only administrators can revoke approval';

    end if;


    update public.profiles

    set
        approved = false,
        approved_at = null,
        approved_by = null

    where id = target_user_id;


    if not found then

        raise exception 'User profile not found';

    end if;

end;

$$;


-- ============================================================
-- HELPER FUNCTION:
-- CHECK CURRENT USER APPROVAL
-- ============================================================

create or replace function public.is_lab_user_approved()

returns boolean

language sql

security definer

set search_path = public

as $$

    select exists (

        select 1

        from public.profiles

        where id = auth.uid()

          and approved = true

          and role in ('user', 'admin')

    );

$$;


-- ============================================================
-- HELPER FUNCTION:
-- CHECK CURRENT USER IS ADMIN
-- ============================================================

create or replace function public.is_lab_admin()

returns boolean

language sql

security definer

set search_path = public

as $$

    select exists (

        select 1

        from public.profiles

        where id = auth.uid()

          and role = 'admin'

          and approved = true

    );

$$;


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;

alter table public.patients enable row level security;

alter table public.samples enable row level security;

alter table public.analyses enable row level security;

alter table public.detections enable row level security;

alter table public.reports enable row level security;

alter table public.audit_log enable row level security;


-- ============================================================
-- PROFILE POLICIES
-- ============================================================
-- Users can see their own profile.
-- Admins can see all profiles.
-- Admin approval is performed through the secure function.
-- ============================================================

drop policy if exists
"Users can view own profile"
on public.profiles;


create policy
"Users can view own profile"

on public.profiles

for select

to authenticated

using (
    id = auth.uid()
    or public.is_lab_admin()
);


-- ============================================================
-- ADMIN CAN UPDATE USER APPROVAL
-- ============================================================

drop policy if exists
"Admins can update profiles"
on public.profiles;


create policy
"Admins can update profiles"

on public.profiles

for update

to authenticated

using (
    public.is_lab_admin()
)

with check (
    public.is_lab_admin()
);


-- ============================================================
-- BASIC CLINICAL DATA POLICIES
-- ============================================================
-- These policies intentionally require an approved account.
-- Your trusted backend/service role can still access all data.
-- ============================================================

drop policy if exists
"Approved users can access patients"
on public.patients;


create policy
"Approved users can access patients"

on public.patients

for all

to authenticated

using (
    public.is_lab_user_approved()
)

with check (
    public.is_lab_user_approved()
);


drop policy if exists
"Approved users can access samples"
on public.samples;


create policy
"Approved users can access samples"

on public.samples

for all

to authenticated

using (
    public.is_lab_user_approved()
)

with check (
    public.is_lab_user_approved()
);


drop policy if exists
"Approved users can access analyses"
on public.analyses;


create policy
"Approved users can access analyses"

on public.analyses

for all

to authenticated

using (
    public.is_lab_user_approved()
)

with check (
    public.is_lab_user_approved()
);


drop policy if exists
"Approved users can access detections"
on public.detections;


create policy
"Approved users can access detections"

on public.detections

for all

to authenticated

using (
    public.is_lab_user_approved()
)

with check (
    public.is_lab_user_approved()
);


drop policy if exists
"Approved users can access reports"
on public.reports;


create policy
"Approved users can access reports"

on public.reports

for all

to authenticated

using (
    public.is_lab_user_approved()
)

with check (
    public.is_lab_user_approved()
);


drop policy if exists
"Admins can access audit log"
on public.audit_log;


create policy
"Admins can access audit log"

on public.audit_log

for all

to authenticated

using (
    public.is_lab_admin()
)

with check (
    public.is_lab_admin()
);


-- ============================================================
-- IMPORTANT:
--
-- SUPABASE DASHBOARD AUTH SETTINGS
--
-- Authentication
-- → Providers
-- → Email
--
-- Enable Email provider.
--
-- Enable:
-- "Confirm email"
--
-- This ensures that a user must confirm their email address.
--
-- Admin approval is handled separately through:
--
-- profiles.approved
--
-- Therefore:
--
-- EMAIL CONFIRMED
--       +
-- ADMIN APPROVED
--       =
-- LABSIGHT ACCESS
--
-- ============================================================
