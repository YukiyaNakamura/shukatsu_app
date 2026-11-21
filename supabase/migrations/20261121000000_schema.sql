-- =============================================================================
-- 就活選考管理アプリ: スキーマ定義
--   * 応募データの所有者は常に学生本人 (applications.student_id)
--   * 組織は学生データを「所有」せず、ACTIVE な所属を通してのみ参照する
-- =============================================================================

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('STUDENT', 'ADMIN');
create type public.org_member_role as enum ('OWNER', 'ADMIN');
create type public.membership_status as enum ('ACTIVE', 'ENDED');
create type public.selection_type as enum ('INTERNSHIP', 'FULL_TIME');
create type public.application_status as enum (
  'PLANNED', 'IN_PROGRESS', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'CANCELLED'
);
create type public.step_type as enum (
  'ENTRY',             -- エントリー
  'DOCUMENT',          -- 書類選考・ES
  'APTITUDE_TEST',     -- 適性検査・Webテスト
  'GROUP_DISCUSSION',  -- グループディスカッション
  'GROUP_INTERVIEW',   -- グループ面接
  'FIRST_INTERVIEW',   -- 一次面接
  'SECOND_INTERVIEW',  -- 二次面接
  'THIRD_INTERVIEW',   -- 三次面接
  'FINAL_INTERVIEW',   -- 最終面接
  'MEETING',           -- 面談
  'ASSIGNMENT',        -- 課題・コーディングテスト
  'OTHER'              -- その他
);
create type public.step_status as enum ('NOT_STARTED', 'SCHEDULED', 'COMPLETED', 'SKIPPED');
create type public.step_result as enum ('PENDING', 'PASSED', 'FAILED');
create type public.join_request_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
create type public.invitation_role as enum ('STUDENT', 'ADMIN');
create type public.deletion_request_status as enum ('REQUESTED', 'PROCESSING', 'COMPLETED', 'CANCELLED');

-- ---------------------------------------------------------------------------
-- profiles (メールアドレスは auth.users を正とし、ここには保存しない)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text not null
    constraint profiles_full_name_length check (char_length(btrim(full_name)) between 1 and 100),
  university_name text
    constraint profiles_university_length check (
      university_name is null or char_length(btrim(university_name)) between 1 and 100
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_student_requires_university check (role <> 'STUDENT' or university_name is not null)
);

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint organizations_name_length check (char_length(btrim(name)) between 1 and 100),
  created_by uuid references public.profiles (id) on delete set null,
  join_code_hash text unique,
  join_code_issued_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- organization_members (管理者)。MVP では管理者 1 人につき 1 組織。
-- ---------------------------------------------------------------------------
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_member_role not null,
  joined_at timestamptz not null default now(),
  constraint organization_members_one_org_per_admin unique (user_id)
);
create unique index organization_members_one_owner
  on public.organization_members (organization_id) where role = 'OWNER';
create index organization_members_org_idx on public.organization_members (organization_id);

-- ---------------------------------------------------------------------------
-- student_memberships (学生の組織所属)。ACTIVE は学生 1 人につき最大 1 件。
-- ---------------------------------------------------------------------------
create table public.student_memberships (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status public.membership_status not null default 'ACTIVE',
  consent_version text not null
    constraint student_memberships_consent_version_length check (char_length(consent_version) between 1 and 50),
  consented_at timestamptz not null,
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null,
  constraint student_memberships_ended_consistency check ((status = 'ACTIVE') = (ended_at is null))
);
create unique index student_memberships_one_active
  on public.student_memberships (student_id) where status = 'ACTIVE';
create index student_memberships_org_active_idx
  on public.student_memberships (organization_id) where status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- applications (応募)。所有者は学生本人。
-- ---------------------------------------------------------------------------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  company_name text not null
    constraint applications_company_name_length check (char_length(btrim(company_name)) between 1 and 200),
  company_name_normalized text not null default '',
  selection_type public.selection_type not null,
  is_early_selection boolean not null default false,
  job_title text
    constraint applications_job_title_length check (job_title is null or char_length(job_title) <= 200),
  applied_at date,
  company_url text
    constraint applications_company_url_format check (
      company_url is null or (char_length(company_url) <= 2048 and company_url ~* '^https?://')
    ),
  priority smallint
    constraint applications_priority_range check (priority is null or priority between 1 and 5),
  application_source text
    constraint applications_source_length check (application_source is null or char_length(application_source) <= 100),
  status public.application_status not null default 'PLANNED',
  current_step_id uuid,
  memo text
    constraint applications_memo_length check (memo is null or char_length(memo) <= 10000),
  version integer not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- 早期選考は本選考 (FULL_TIME) に含める
  constraint applications_early_requires_full_time check (not is_early_selection or selection_type = 'FULL_TIME'),
  -- events から (student_id, id) で参照するための一意制約
  constraint applications_student_id_id_key unique (student_id, id)
);
create index applications_student_idx on public.applications (student_id, updated_at desc);
create index applications_company_normalized_idx on public.applications (company_name_normalized);

-- ---------------------------------------------------------------------------
-- selection_steps (選考ステップ)
-- ---------------------------------------------------------------------------
create table public.selection_steps (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  step_type public.step_type not null,
  display_name text not null
    constraint selection_steps_display_name_length check (char_length(btrim(display_name)) between 1 and 100),
  position integer not null
    constraint selection_steps_position_nonnegative check (position >= 0),
  status public.step_status not null default 'NOT_STARTED',
  result public.step_result,
  scheduled_at timestamptz,
  deadline_at timestamptz,
  location text
    constraint selection_steps_location_length check (location is null or char_length(location) <= 200),
  meeting_url text
    constraint selection_steps_meeting_url_format check (
      meeting_url is null or (char_length(meeting_url) <= 2048 and meeting_url ~* '^https?://')
    ),
  notes text
    constraint selection_steps_notes_length check (notes is null or char_length(notes) <= 5000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- applications.current_step_id の複合外部キー参照先
  constraint selection_steps_application_id_id_key unique (application_id, id)
);
create index selection_steps_application_idx on public.selection_steps (application_id, position);
create index selection_steps_scheduled_idx on public.selection_steps (scheduled_at) where scheduled_at is not null;
create index selection_steps_deadline_idx on public.selection_steps (deadline_at) where deadline_at is not null;

-- 現在の選考ステップは必ず同じ応募に属する (複合 FK で DB レベル保証)
alter table public.applications
  add constraint applications_current_step_fk
  foreign key (id, current_step_id)
  references public.selection_steps (application_id, id)
  on delete set null (current_step_id);

-- ---------------------------------------------------------------------------
-- events (独立した就活予定)。選考ステップの日時はここに複製しない。
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  application_id uuid,
  title text not null
    constraint events_title_length check (char_length(btrim(title)) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  description text
    constraint events_description_length check (description is null or char_length(description) <= 5000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_order check (ends_at is null or ends_at >= starts_at),
  -- 紐づける応募は同じ学生のものに限る
  constraint events_application_fk
    foreign key (student_id, application_id)
    references public.applications (student_id, id)
    on delete set null (application_id)
);
create index events_student_starts_idx on public.events (student_id, starts_at);

-- ---------------------------------------------------------------------------
-- invitations (招待リンク)。トークンは SHA-256 ハッシュのみ保存。
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text
    constraint invitations_email_format check (
      email is null or (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$' and char_length(email) <= 320)
    ),
  invitee_role public.invitation_role not null default 'STUDENT',
  token_hash text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  -- 管理者招待は必ずメールアドレス指定
  constraint invitations_admin_requires_email check (invitee_role = 'STUDENT' or email is not null)
);
create index invitations_org_idx on public.invitations (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- join_requests (組織コードによる参加申請)
-- ---------------------------------------------------------------------------
create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status public.join_request_status not null default 'PENDING',
  consent_version text not null
    constraint join_requests_consent_version_length check (char_length(consent_version) between 1 and 50),
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null
);
create unique index join_requests_one_pending
  on public.join_requests (student_id) where status = 'PENDING';
create index join_requests_org_idx on public.join_requests (organization_id, status);

-- ---------------------------------------------------------------------------
-- audit_logs (変更履歴)。トリガーからのみ書き込む。秘密情報は保存しない。
-- 保存期間: 作成から 1 年 (private.purge_old_audit_logs で削除)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  application_id uuid,
  student_id uuid,
  action text not null constraint audit_logs_action_check check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_application_idx on public.audit_logs (application_id, created_at desc);
create index audit_logs_student_idx on public.audit_logs (student_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at);

-- ---------------------------------------------------------------------------
-- account_deletion_requests (退会申請)。処理後も申請記録は残す (user_id は NULL 化)
-- ---------------------------------------------------------------------------
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  status public.deletion_request_status not null default 'REQUESTED',
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);
create unique index account_deletion_requests_one_open
  on public.account_deletion_requests (user_id) where status in ('REQUESTED', 'PROCESSING');
