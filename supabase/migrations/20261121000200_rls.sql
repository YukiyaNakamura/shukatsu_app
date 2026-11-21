-- =============================================================================
-- アクセス制御: 権限 (GRANT) と Row Level Security
--   * 学生本人: 自分のデータ
--   * 管理者: 自組織に ACTIVE 所属している学生のデータのみ
--   * 所属が ENDED になった時点で管理者のアクセスは即時失効 (関数が毎回評価)
-- =============================================================================

grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 認可ヘルパー (SECURITY DEFINER: RLS の再帰を避けるため。search_path 固定)
-- ---------------------------------------------------------------------------
create or replace function private.my_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select om.organization_id from public.organization_members om where om.user_id = (select auth.uid());
$$;

create or replace function private.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = p_org and om.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_org_owner(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = p_org and om.user_id = (select auth.uid()) and om.role = 'OWNER'
  );
$$;

create or replace function private.is_admin_of_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_memberships sm
    join public.organization_members om on om.organization_id = sm.organization_id
    where sm.student_id = p_student
      and sm.status = 'ACTIVE'
      and om.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_access_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_student = (select auth.uid()) or private.is_admin_of_student(p_student);
$$;

create or replace function private.can_access_application(p_application uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.applications a
    where a.id = p_application and private.can_access_student(a.student_id)
  );
$$;

create or replace function private.is_active_member_of_org(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_memberships sm
    where sm.organization_id = p_org and sm.student_id = (select auth.uid()) and sm.status = 'ACTIVE'
  );
$$;

-- 学生が自分の参加申請先 (審査中) の組織名を確認できるようにする
create or replace function private.has_pending_request_to_org(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.join_requests jr
    where jr.organization_id = p_org and jr.student_id = (select auth.uid()) and jr.status = 'PENDING'
  );
$$;

-- 管理者が「参加申請中」の学生の氏名・大学名を確認できるようにする
create or replace function private.has_pending_request_to_my_org(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.join_requests jr
    join public.organization_members om on om.organization_id = jr.organization_id
    where jr.student_id = p_student and jr.status = 'PENDING' and om.user_id = (select auth.uid())
  );
$$;

-- 同じ組織の管理者同士 / 所属学生から見た管理者
create or replace function private.is_visible_org_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members target
    where target.user_id = p_user
      and (private.is_org_admin(target.organization_id) or private.is_active_member_of_org(target.organization_id))
  );
$$;

-- 管理者が学生のデータを参照できる起点 (自組織での ACTIVE 所属の開始日時)。該当なしは NULL
create or replace function private.admin_visible_since(p_student uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select sm.joined_at
  from public.student_memberships sm
  join public.organization_members om on om.organization_id = sm.organization_id
  where sm.student_id = p_student
    and sm.status = 'ACTIVE'
    and om.user_id = (select auth.uid());
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- テーブル権限: anon には一切付与しない。authenticated は必要最小限。
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
-- 今後作成されるテーブル・シーケンスも既定では anon / authenticated に公開しない (必要なものは明示的に GRANT する)
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, university_name) on public.profiles to authenticated;

-- join_code_hash は管理者にも返さない (オフライン総当たり対策)
grant select (id, name, created_by, join_code_issued_at, created_at) on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;

grant select, delete on public.organization_members to authenticated;
grant select on public.student_memberships to authenticated;

grant select, insert on public.applications to authenticated;
grant update (
  company_name, selection_type, is_early_selection, job_title, applied_at, company_url,
  priority, application_source, status, current_step_id, memo, deleted_at
) on public.applications to authenticated;

grant select, insert, delete on public.selection_steps to authenticated;
grant update (
  step_type, display_name, position, status, result, scheduled_at, deadline_at, location, meeting_url, notes
) on public.selection_steps to authenticated;

grant select, insert, delete on public.events to authenticated;
grant update (application_id, title, starts_at, ends_at, description) on public.events to authenticated;

grant select (id, organization_id, email, invitee_role, created_by, expires_at, used_at, used_by, revoked_at, created_at)
  on public.invitations to authenticated;

grant select on public.join_requests to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.account_deletion_requests to authenticated;

-- ---------------------------------------------------------------------------
-- RLS 有効化 (全テーブル)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.student_memberships enable row level security;
alter table public.applications enable row level security;
alter table public.selection_steps enable row level security;
alter table public.events enable row level security;
alter table public.invitations enable row level security;
alter table public.join_requests enable row level security;
alter table public.audit_logs enable row level security;
alter table public.account_deletion_requests enable row level security;

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or private.is_admin_of_student(id)
    or private.has_pending_request_to_my_org(id)
    or private.is_visible_org_admin(id)
  );
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- organizations
create policy organizations_select on public.organizations
  for select to authenticated
  using (private.is_org_admin(id) or private.is_active_member_of_org(id) or private.has_pending_request_to_org(id));
create policy organizations_update on public.organizations
  for update to authenticated
  using (private.is_org_admin(id))
  with check (private.is_org_admin(id));

-- organization_members
create policy organization_members_select on public.organization_members
  for select to authenticated
  using (private.is_org_admin(organization_id) or private.is_active_member_of_org(organization_id));
-- OWNER は他の管理者を削除可能。管理者本人は自分で脱退可能。OWNER 行は削除不可。
create policy organization_members_delete on public.organization_members
  for delete to authenticated
  using (
    role <> 'OWNER'
    and (private.is_org_owner(organization_id) or user_id = (select auth.uid()))
  );

-- student_memberships (変更は RPC 経由のみ)
create policy student_memberships_select on public.student_memberships
  for select to authenticated
  using (student_id = (select auth.uid()) or private.is_org_admin(organization_id));

-- applications (物理削除は不可。論理削除は deleted_at の更新)
create policy applications_select on public.applications
  for select to authenticated
  using (private.can_access_student(student_id));
create policy applications_insert on public.applications
  for insert to authenticated
  with check (private.can_access_student(student_id));
create policy applications_update on public.applications
  for update to authenticated
  using (private.can_access_student(student_id))
  with check (private.can_access_student(student_id));

-- selection_steps
create policy selection_steps_select on public.selection_steps
  for select to authenticated
  using (private.can_access_application(application_id));
create policy selection_steps_insert on public.selection_steps
  for insert to authenticated
  with check (private.can_access_application(application_id));
create policy selection_steps_update on public.selection_steps
  for update to authenticated
  using (private.can_access_application(application_id))
  with check (private.can_access_application(application_id));
create policy selection_steps_delete on public.selection_steps
  for delete to authenticated
  using (private.can_access_application(application_id));

-- events
create policy events_select on public.events
  for select to authenticated
  using (private.can_access_student(student_id));
create policy events_insert on public.events
  for insert to authenticated
  with check (private.can_access_student(student_id));
create policy events_update on public.events
  for update to authenticated
  using (private.can_access_student(student_id))
  with check (private.can_access_student(student_id));
create policy events_delete on public.events
  for delete to authenticated
  using (private.can_access_student(student_id));

-- invitations (作成・取り消しは RPC。token_hash 列は SELECT 権限なし。直接 UPDATE 不可)
create policy invitations_select on public.invitations
  for select to authenticated
  using (private.is_org_admin(organization_id));
-- join_requests (作成・審査は RPC)
create policy join_requests_select on public.join_requests
  for select to authenticated
  using (student_id = (select auth.uid()) or private.is_org_admin(organization_id));

-- audit_logs (閲覧のみ。書き込みはトリガーのみ)
-- 学生本人はすべて。管理者は「現在の所属開始以降」に記録された応募・ステップ・予定のログのみ
-- (同意前の履歴や、他組織への所属履歴は共有しない)
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    student_id is not null
    and (
      student_id = (select auth.uid())
      or (
        target_type in ('applications', 'selection_steps', 'events')
        and created_at >= private.admin_visible_since(student_id)
      )
    )
  );

-- account_deletion_requests
create policy account_deletion_requests_select on public.account_deletion_requests
  for select to authenticated
  using (user_id = (select auth.uid()));
