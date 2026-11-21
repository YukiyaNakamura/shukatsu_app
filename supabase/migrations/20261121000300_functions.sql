-- =============================================================================
-- RPC 関数
--   * 複数テーブルにまたがる操作を 1 トランザクションで実行する
--   * 例外メッセージは機械可読なエラーコード、detail に日本語の説明
--   * SECURITY DEFINER の関数は必ず auth.uid() と権限を明示的に検証する
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 内部ユーティリティ
-- ---------------------------------------------------------------------------
create or replace function private.sha256_hex(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_value, 'UTF8')), 'hex');
$$;

-- 244 bit の暗号学的乱数 (gen_random_uuid は強い乱数源を使用)
create or replace function private.random_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

-- 8 文字の組織コード (紛らわしい文字 0/O/1/I を除いた 32 文字種)
create or replace function private.random_join_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_index int;
  v_code text := '';
begin
  -- UUID v4 のバージョン/バリアント固定ビットを含むバイト 6, 8 は使わない
  foreach v_index in array array[0, 1, 2, 3, 4, 5, 9, 10] loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_index) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

create or replace function private.normalize_join_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function private.step_type_label(p_type public.step_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'ENTRY' then 'エントリー'
    when 'DOCUMENT' then '書類選考・ES'
    when 'APTITUDE_TEST' then '適性検査・Webテスト'
    when 'GROUP_DISCUSSION' then 'グループディスカッション'
    when 'GROUP_INTERVIEW' then 'グループ面接'
    when 'FIRST_INTERVIEW' then '一次面接'
    when 'SECOND_INTERVIEW' then '二次面接'
    when 'THIRD_INTERVIEW' then '三次面接'
    when 'FINAL_INTERVIEW' then '最終面接'
    when 'MEETING' then '面談'
    when 'ASSIGNMENT' then '課題・コーディングテスト'
    else 'その他'
  end;
$$;

-- 初期テンプレート (応募作成時にコピーされる。変更しても既存応募には影響しない)
create or replace function private.step_template(p_type public.selection_type)
returns table (step_type public.step_type, display_name text, step_position int)
language sql
immutable
set search_path = ''
as $$
  select t.step_type::public.step_type, t.display_name, t.step_position
  from (
    values
      ('FULL_TIME', 'DOCUMENT', 'ES', 0),
      ('FULL_TIME', 'APTITUDE_TEST', '適性検査', 1),
      ('FULL_TIME', 'FIRST_INTERVIEW', '一次面接', 2),
      ('FULL_TIME', 'SECOND_INTERVIEW', '二次面接', 3),
      ('FULL_TIME', 'FINAL_INTERVIEW', '最終面接', 4),
      ('INTERNSHIP', 'DOCUMENT', 'ES', 0),
      ('INTERNSHIP', 'APTITUDE_TEST', '適性検査', 1),
      ('INTERNSHIP', 'FIRST_INTERVIEW', '面接', 2)
  ) as t (selection_type, step_type, display_name, step_position)
  where t.selection_type = p_type::text
  order by t.step_position;
$$;

create or replace function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using detail = 'ログインが必要です。';
  end if;
  return v_uid;
end;
$$;

-- 組織コード入力の失敗記録 (総当たり対策。private スキーマのため API からは不可視)
create table private.join_code_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index join_code_failures_user_idx on private.join_code_failures (user_id, attempted_at);
revoke all on private.join_code_failures from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 組織作成 (作成者を OWNER とする)
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_org uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'ADMIN') then
    raise exception 'NOT_ADMIN_ACCOUNT' using detail = '組織を作成できるのは管理者アカウントのみです。';
  end if;
  if exists (select 1 from public.organization_members om where om.user_id = v_uid) then
    raise exception 'ALREADY_IN_ORGANIZATION' using detail = 'すでに組織に所属しています。';
  end if;

  insert into public.organizations (name, created_by) values (btrim(p_name), v_uid) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role) values (v_org, v_uid, 'OWNER');
  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- 組織コード発行 (再発行で旧コードは無効)。平文は発行時のみ返す。
-- ---------------------------------------------------------------------------
create or replace function public.regenerate_join_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_org uuid := private.my_org_id();
  v_code text;
begin
  if v_org is null then
    raise exception 'NOT_ORG_ADMIN' using detail = '組織の管理者ではありません。';
  end if;
  loop
    v_code := private.random_join_code();
    exit when not exists (
      select 1 from public.organizations o where o.join_code_hash = private.sha256_hex(v_code)
    );
  end loop;
  update public.organizations
    set join_code_hash = private.sha256_hex(v_code), join_code_issued_at = now()
    where id = v_org;
  return v_code;
end;
$$;

create or replace function public.disable_join_code()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_org uuid := private.my_org_id();
begin
  if v_org is null then
    raise exception 'NOT_ORG_ADMIN' using detail = '組織の管理者ではありません。';
  end if;
  update public.organizations set join_code_hash = null, join_code_issued_at = null where id = v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- 招待リンク作成 (有効期限 7 日, 1 回限り)。平文トークンは作成時のみ返す。
-- ---------------------------------------------------------------------------
create or replace function public.create_invitation(
  p_email text default null,
  p_role public.invitation_role default 'STUDENT'
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_org uuid := private.my_org_id();
  v_token text := private.random_token();
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_id uuid;
  v_expires timestamptz;
begin
  if v_org is null then
    raise exception 'NOT_ORG_ADMIN' using detail = '組織の管理者ではありません。';
  end if;
  if p_role = 'ADMIN' then
    if not private.is_org_owner(v_org) then
      raise exception 'FORBIDDEN' using detail = '管理者の招待は組織のオーナーのみ行えます。';
    end if;
    if v_email is null then
      raise exception 'EMAIL_REQUIRED' using detail = '管理者の招待にはメールアドレスが必要です。';
    end if;
  end if;

  insert into public.invitations (organization_id, email, invitee_role, token_hash, created_by)
  values (v_org, v_email, p_role, private.sha256_hex(v_token), v_uid)
  returning id, invitations.expires_at into v_id, v_expires;

  return query select v_id, v_token, v_expires;
end;
$$;

-- 招待の取り消し (未使用・未取り消しのみ。取り消しの解除は不可。管理者招待の取り消しはオーナーのみ)
create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations i where i.id = p_invitation_id for update;
  if not found or not private.is_org_admin(v_inv.organization_id) then
    raise exception 'NOT_FOUND' using detail = '招待が見つかりません。';
  end if;
  if v_inv.invitee_role = 'ADMIN' and not private.is_org_owner(v_inv.organization_id) then
    raise exception 'FORBIDDEN' using detail = '管理者の招待はオーナーのみ取り消せます。';
  end if;
  if v_inv.used_at is not null or v_inv.revoked_at is not null then
    raise exception 'INVITATION_NOT_REVOCABLE' using detail = 'この招待はすでに使用済み、または取り消し済みです。';
  end if;
  update public.invitations set revoked_at = now() where id = v_inv.id;
end;
$$;

-- 招待情報の確認 (ログイン前でも組織名と状態を確認できる。メールアドレスは返さない)
create or replace function public.get_invitation(p_token text)
returns table (
  organization_name text,
  invitee_role public.invitation_role,
  email_restricted boolean,
  expires_at timestamptz,
  state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_org_name text;
begin
  select * into v_inv from public.invitations i where i.token_hash = private.sha256_hex(coalesce(p_token, ''));
  if not found then
    return query select null::text, null::public.invitation_role, null::boolean, null::timestamptz, 'NOT_FOUND'::text;
    return;
  end if;
  select o.name into v_org_name from public.organizations o where o.id = v_inv.organization_id;
  return query select
    v_org_name,
    v_inv.invitee_role,
    v_inv.email is not null,
    v_inv.expires_at,
    case
      when v_inv.revoked_at is not null then 'REVOKED'
      when v_inv.used_at is not null then 'USED'
      when v_inv.expires_at <= now() then 'EXPIRED'
      else 'VALID'
    end;
end;
$$;

-- 招待の受諾。学生は共有同意 (consent_version) が必須。
create or replace function public.accept_invitation(p_token text, p_consent_version text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_inv public.invitations;
  v_role public.user_role;
  v_email text;
  v_email_confirmed timestamptz;
begin
  select * into v_inv from public.invitations i
    where i.token_hash = private.sha256_hex(coalesce(p_token, ''))
    for update;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using detail = '招待リンクが無効です。';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'INVITATION_REVOKED' using detail = 'この招待リンクは取り消されています。';
  end if;
  if v_inv.used_at is not null then
    raise exception 'INVITATION_USED' using detail = 'この招待リンクはすでに使用されています。';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED' using detail = 'この招待リンクは有効期限が切れています。';
  end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_email_confirmed
    from auth.users u where u.id = v_uid;
  if v_inv.email is not null and (v_email is distinct from v_inv.email or v_email_confirmed is null) then
    raise exception 'INVITATION_EMAIL_MISMATCH'
      using detail = '招待先のメールアドレスと、ログイン中の認証済みメールアドレスが一致しません。';
  end if;

  select p.role into v_role from public.profiles p where p.id = v_uid;

  if v_inv.invitee_role = 'STUDENT' then
    if v_role is distinct from 'STUDENT' then
      raise exception 'NOT_STUDENT_ACCOUNT' using detail = 'この招待は学生アカウント向けです。';
    end if;
    if nullif(btrim(coalesce(p_consent_version, '')), '') is null then
      raise exception 'CONSENT_REQUIRED' using detail = '選考情報の共有への同意が必要です。';
    end if;
    if exists (select 1 from public.student_memberships sm where sm.student_id = v_uid and sm.status = 'ACTIVE') then
      raise exception 'ALREADY_IN_ORGANIZATION' using detail = 'すでに別の組織に所属しています。先に脱退してください。';
    end if;
    insert into public.student_memberships (student_id, organization_id, status, consent_version, consented_at)
      values (v_uid, v_inv.organization_id, 'ACTIVE', btrim(p_consent_version), now());
    update public.join_requests set status = 'CANCELLED'
      where student_id = v_uid and status = 'PENDING';
  else
    if v_role is distinct from 'ADMIN' then
      raise exception 'NOT_ADMIN_ACCOUNT' using detail = 'この招待は管理者アカウント向けです。';
    end if;
    if exists (select 1 from public.organization_members om where om.user_id = v_uid) then
      raise exception 'ALREADY_IN_ORGANIZATION' using detail = 'すでに組織に所属しています。';
    end if;
    insert into public.organization_members (organization_id, user_id, role)
      values (v_inv.organization_id, v_uid, 'ADMIN');
  end if;

  update public.invitations set used_at = now(), used_by = v_uid where id = v_inv.id;
  return v_inv.organization_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 組織コードによる参加申請 (承認されるまでデータは共有されない)
-- ---------------------------------------------------------------------------
create or replace function public.request_join(p_code text, p_consent_version text)
returns table (request_id uuid, organization_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_org public.organizations;
  v_request uuid;
  v_code text := private.normalize_join_code(p_code);
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'STUDENT') then
    raise exception 'NOT_STUDENT_ACCOUNT' using detail = '組織コードで参加できるのは学生アカウントのみです。';
  end if;
  if nullif(btrim(coalesce(p_consent_version, '')), '') is null then
    raise exception 'CONSENT_REQUIRED' using detail = '選考情報の共有への同意が必要です。';
  end if;
  -- 総当たり対策: 直近 1 時間の失敗が上限に達したら拒否
  if (
    select count(*) from private.join_code_failures f
    where f.user_id = v_uid and f.attempted_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'RATE_LIMITED' using detail = '組織コードの入力に続けて失敗したため、しばらく時間をおいてから再度お試しください。';
  end if;

  select * into v_org from public.organizations o
    where char_length(v_code) = 8 and o.join_code_hash = private.sha256_hex(v_code);
  if not found then
    -- 例外を投げるとロールバックされ失敗が記録されないため、行を返さずに終了する (API 側で 404 に変換)
    delete from private.join_code_failures f where f.user_id = v_uid and f.attempted_at < now() - interval '1 day';
    insert into private.join_code_failures (user_id) values (v_uid);
    return;
  end if;
  if exists (select 1 from public.student_memberships sm where sm.student_id = v_uid and sm.status = 'ACTIVE') then
    raise exception 'ALREADY_IN_ORGANIZATION' using detail = 'すでに組織に所属しています。先に脱退してください。';
  end if;
  if exists (select 1 from public.join_requests jr where jr.student_id = v_uid and jr.status = 'PENDING') then
    raise exception 'JOIN_REQUEST_PENDING' using detail = '審査中の参加申請があります。';
  end if;

  insert into public.join_requests (student_id, organization_id, status, consent_version, consented_at)
    values (v_uid, v_org.id, 'PENDING', btrim(p_consent_version), now())
    returning id into v_request;

  return query select v_request, v_org.name;
end;
$$;

-- 学生による参加申請の取り下げ (= 同意の撤回)
create or replace function public.cancel_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  update public.join_requests
    set status = 'CANCELLED', reviewed_at = now(), reviewed_by = v_uid
    where id = p_request_id and student_id = v_uid and status = 'PENDING';
  if not found then
    raise exception 'NOT_FOUND' using detail = '審査中の参加申請が見つかりません。';
  end if;
end;
$$;

-- 管理者による参加申請の承認・却下
create or replace function public.review_join_request(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_req public.join_requests;
begin
  select * into v_req from public.join_requests jr where jr.id = p_request_id for update;
  if not found or not private.is_org_admin(v_req.organization_id) then
    raise exception 'NOT_FOUND' using detail = '参加申請が見つかりません。';
  end if;
  if v_req.status <> 'PENDING' then
    raise exception 'JOIN_REQUEST_NOT_PENDING' using detail = 'この参加申請はすでに処理済み、または取り下げられています。';
  end if;

  if p_approve then
    -- 学生の同意 (PENDING のまま取り下げられていないこと) を確認したうえで所属を確定
    if exists (select 1 from public.student_memberships sm where sm.student_id = v_req.student_id and sm.status = 'ACTIVE') then
      raise exception 'ALREADY_IN_ORGANIZATION' using detail = 'この学生はすでに別の組織に所属しています。';
    end if;
    insert into public.student_memberships (student_id, organization_id, status, consent_version, consented_at)
      values (v_req.student_id, v_req.organization_id, 'ACTIVE', v_req.consent_version, v_req.consented_at);
  end if;

  update public.join_requests
    set status = case when p_approve then 'APPROVED'::public.join_request_status else 'REJECTED'::public.join_request_status end,
        reviewed_at = now(),
        reviewed_by = v_uid
    where id = v_req.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 所属解除 (学生本人 / 組織管理者)。応募データは学生側に残る。
-- ---------------------------------------------------------------------------
create or replace function public.end_membership(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_m public.student_memberships;
begin
  select * into v_m from public.student_memberships sm where sm.id = p_membership_id for update;
  if not found or not (v_m.student_id = v_uid or private.is_org_admin(v_m.organization_id)) then
    raise exception 'NOT_FOUND' using detail = '所属情報が見つかりません。';
  end if;
  if v_m.status <> 'ACTIVE' then
    raise exception 'MEMBERSHIP_NOT_ACTIVE' using detail = 'この所属はすでに解除されています。';
  end if;
  update public.student_memberships
    set status = 'ENDED', ended_at = now(), ended_by = v_uid
    where id = v_m.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 応募作成 + テンプレートからステップ生成 (SECURITY INVOKER: RLS がそのまま適用される)
-- ---------------------------------------------------------------------------
create or replace function public.create_application(
  p_student_id uuid,
  p_company_name text,
  p_selection_type public.selection_type,
  p_is_early_selection boolean default false,
  p_job_title text default null,
  p_status public.application_status default 'PLANNED',
  p_use_template boolean default true
)
returns public.applications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_app public.applications;
  v_first uuid;
begin
  perform private.require_uid();

  insert into public.applications (student_id, company_name, selection_type, is_early_selection, job_title, status)
    values (p_student_id, p_company_name, p_selection_type, coalesce(p_is_early_selection, false),
            nullif(btrim(coalesce(p_job_title, '')), ''), coalesce(p_status, 'PLANNED'))
    returning * into v_app;

  if p_use_template then
    insert into public.selection_steps (application_id, step_type, display_name, position)
      select v_app.id, t.step_type, t.display_name, t.step_position
      from private.step_template(p_selection_type) t;

    select s.id into v_first from public.selection_steps s
      where s.application_id = v_app.id order by s.position limit 1;

    update public.applications set current_step_id = v_first where id = v_app.id returning * into v_app;
  end if;

  return v_app;
end;
$$;

-- ---------------------------------------------------------------------------
-- 一覧の「現在の選考段階」変更 (楽観的ロック付き)
--   既存の同種ステップ (未完了優先) を現在段階にし、無ければ末尾に追加する
-- ---------------------------------------------------------------------------
create or replace function public.set_current_stage(
  p_application_id uuid,
  p_step_type public.step_type,
  p_expected_version integer
)
returns public.applications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_app public.applications;
  v_step uuid;
begin
  perform private.require_uid();

  select * into v_app from public.applications a
    where a.id = p_application_id and a.deleted_at is null
    for update;
  if not found then
    raise exception 'NOT_FOUND' using detail = '応募が見つかりません。';
  end if;
  if v_app.version <> p_expected_version then
    raise exception 'VERSION_CONFLICT' using detail = '他のユーザーがこの応募を更新しました。';
  end if;

  select s.id into v_step from public.selection_steps s
    where s.application_id = p_application_id and s.step_type = p_step_type
    order by
      (s.id = v_app.current_step_id) desc,
      (s.status in ('COMPLETED', 'SKIPPED')) asc,
      case when s.status in ('COMPLETED', 'SKIPPED') then -s.position else s.position end asc
    limit 1;

  if v_step is null then
    insert into public.selection_steps (application_id, step_type, display_name, position)
      values (
        p_application_id,
        p_step_type,
        private.step_type_label(p_step_type),
        coalesce((select max(s.position) + 1 from public.selection_steps s where s.application_id = p_application_id), 0)
      )
      returning id into v_step;
  end if;

  update public.applications set current_step_id = v_step where id = p_application_id returning * into v_app;
  return v_app;
end;
$$;

-- ステップの並べ替え (指定された順に position を振り直す)
create or replace function public.reorder_steps(p_application_id uuid, p_step_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  perform private.require_uid();
  select count(*) into v_count from public.selection_steps s where s.application_id = p_application_id;
  if v_count = 0 and not private.can_access_application(p_application_id) then
    raise exception 'NOT_FOUND' using detail = '応募が見つかりません。';
  end if;
  if v_count <> coalesce(array_length(p_step_ids, 1), 0)
     or v_count <> (select count(distinct x) from unnest(p_step_ids) x)
     or exists (
       select 1 from unnest(p_step_ids) x
       where not exists (select 1 from public.selection_steps s where s.id = x and s.application_id = p_application_id)
     ) then
    raise exception 'INVALID_STEP_ORDER' using detail = 'ステップの並び順が最新ではありません。再読み込みしてください。';
  end if;

  update public.selection_steps s
    set position = o.ord - 1
    from unnest(p_step_ids) with ordinality as o (step_id, ord)
    where s.id = o.step_id and s.position is distinct from (o.ord - 1)::int;
end;
$$;

-- ---------------------------------------------------------------------------
-- 管理者: 所属学生の一覧と集計 (SECURITY INVOKER: RLS 適用)
-- ---------------------------------------------------------------------------
create or replace function public.org_student_overview()
returns table (
  student_id uuid,
  membership_id uuid,
  full_name text,
  university_name text,
  joined_at timestamptz,
  application_count bigint,
  in_progress_count bigint,
  accepted_count bigint,
  last_updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    sm.id,
    p.full_name,
    p.university_name,
    sm.joined_at,
    count(a.id) filter (where a.deleted_at is null),
    count(a.id) filter (where a.deleted_at is null and a.status = 'IN_PROGRESS'),
    count(a.id) filter (where a.deleted_at is null and a.status = 'ACCEPTED'),
    greatest(
      max(a.updated_at),
      (select max(s.updated_at) from public.selection_steps s
         join public.applications a2 on a2.id = s.application_id
        where a2.student_id = p.id),
      (select max(e.updated_at) from public.events e where e.student_id = p.id)
    )
  from public.student_memberships sm
  join public.profiles p on p.id = sm.student_id
  left join public.applications a on a.student_id = sm.student_id
  where sm.status = 'ACTIVE' and sm.organization_id = private.my_org_id()
  group by p.id, sm.id
  order by p.full_name;
$$;

-- ---------------------------------------------------------------------------
-- 退会申請
-- ---------------------------------------------------------------------------
create or replace function public.request_account_deletion()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
begin
  if exists (
    select 1 from public.account_deletion_requests r
    where r.user_id = v_uid and r.status in ('REQUESTED', 'PROCESSING')
  ) then
    raise exception 'DELETION_ALREADY_REQUESTED' using detail = 'すでに退会申請済みです。';
  end if;
  insert into public.account_deletion_requests (user_id) values (v_uid) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  update public.account_deletion_requests set status = 'CANCELLED', processed_at = now()
    where user_id = v_uid and status = 'REQUESTED';
  if not found then
    raise exception 'NOT_FOUND' using detail = '取り消せる退会申請がありません。';
  end if;
end;
$$;

-- 運営者 (service_role) による退会処理
--   * 所有組織: 他の管理者がいれば最古の管理者へ OWNER を移譲、いなければ組織を削除
--   * auth.users を削除 → profiles 以下の個人データは ON DELETE CASCADE で削除
--   * その学生のデータに関する監査ログを削除、他者データへの操作ログは actor_id を NULL 化 (匿名化)
create or replace function public.process_account_deletion(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.account_deletion_requests;
  v_uid uuid;
  v_org uuid;
  v_successor uuid;
  v_app_ids uuid[];
begin
  select * into v_req from public.account_deletion_requests r where r.id = p_request_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_req.status <> 'REQUESTED' then
    raise exception 'DELETION_NOT_REQUESTED' using detail = '処理対象の状態ではありません。';
  end if;
  v_uid := v_req.user_id;
  update public.account_deletion_requests set status = 'PROCESSING' where id = v_req.id;
  -- 連鎖削除中のステップの監査ログは親応募を参照できず student_id が NULL になるため、応募 ID を先に控える
  select coalesce(array_agg(a.id), '{}') into v_app_ids from public.applications a where a.student_id = v_uid;

  for v_org in
    select om.organization_id from public.organization_members om where om.user_id = v_uid and om.role = 'OWNER'
  loop
    select om.user_id into v_successor from public.organization_members om
      where om.organization_id = v_org and om.user_id <> v_uid
      order by om.joined_at limit 1;
    delete from public.organization_members om where om.organization_id = v_org and om.user_id = v_uid;
    if v_successor is null then
      delete from public.organizations o where o.id = v_org;
    else
      update public.organization_members set role = 'OWNER' where organization_id = v_org and user_id = v_successor;
    end if;
  end loop;

  delete from auth.users u where u.id = v_uid;
  delete from public.audit_logs l where l.student_id = v_uid or l.application_id = any (v_app_ids);

  update public.account_deletion_requests set status = 'COMPLETED', processed_at = now() where id = v_req.id;
end;
$$;

-- 監査ログの保存期間 (1 年) を過ぎたものを削除 (運営者が定期実行)
create or replace function public.purge_old_audit_logs()
returns bigint
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.audit_logs where created_at < now() - interval '1 year' returning 1
  )
  select count(*) from deleted;
$$;

-- ---------------------------------------------------------------------------
-- 関数の実行権限
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.get_invitation(text) to anon, authenticated;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.regenerate_join_code() to authenticated;
grant execute on function public.disable_join_code() to authenticated;
grant execute on function public.create_invitation(text, public.invitation_role) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation(text, text) to authenticated;
grant execute on function public.request_join(text, text) to authenticated;
grant execute on function public.cancel_join_request(uuid) to authenticated;
grant execute on function public.review_join_request(uuid, boolean) to authenticated;
grant execute on function public.end_membership(uuid) to authenticated;
grant execute on function public.create_application(uuid, text, public.selection_type, boolean, text, public.application_status, boolean) to authenticated;
grant execute on function public.set_current_stage(uuid, public.step_type, integer) to authenticated;
grant execute on function public.reorder_steps(uuid, uuid[]) to authenticated;
grant execute on function public.org_student_overview() to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;

grant execute on function public.process_account_deletion(uuid) to service_role;
grant execute on function public.purge_old_audit_logs() to service_role;

-- 新しく作られる関数がデフォルトで公開されないようにする
-- スキーマ単位の指定では PUBLIC への既定の EXECUTE を外せないため、グローバルにも指定する
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
