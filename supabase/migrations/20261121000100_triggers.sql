-- =============================================================================
-- トリガー: updated_at / 楽観的ロック version / 不変列 / ロール整合性 / 監査ログ
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 新規ユーザー作成時に profiles を作成
--   raw_user_meta_data: { role: 'STUDENT' | 'ADMIN', full_name, university_name }
--   ロールの選択はサインアップ時のみ。以後は変更不可 (profiles_guard)。
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  v_role := case when new.raw_user_meta_data ->> 'role' = 'ADMIN' then 'ADMIN' else 'STUDENT' end;

  insert into public.profiles (id, role, full_name, university_name)
  values (
    new.id,
    v_role,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), '未設定'),
    case
      when v_role = 'STUDENT'
        then coalesce(nullif(btrim(new.raw_user_meta_data ->> 'university_name'), ''), '未設定')
      else nullif(btrim(new.raw_user_meta_data ->> 'university_name'), '')
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- 共通: updated_at
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: id / role の変更禁止 (権限昇格対策)
-- ---------------------------------------------------------------------------
create or replace function private.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.role is distinct from old.role then
    raise exception 'FORBIDDEN_FIELD' using detail = 'ロールは変更できません。';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function private.profiles_guard();

-- ---------------------------------------------------------------------------
-- organization_members: ADMIN ロールのユーザーのみ
-- ---------------------------------------------------------------------------
create or replace function private.organization_members_check_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'ADMIN') then
    raise exception 'NOT_ADMIN_ACCOUNT' using detail = '管理者アカウントではありません。';
  end if;
  return new;
end;
$$;

create trigger organization_members_check_role
  before insert or update on public.organization_members
  for each row execute function private.organization_members_check_role();

-- ---------------------------------------------------------------------------
-- student_memberships / join_requests: STUDENT ロールのユーザーのみ
-- ---------------------------------------------------------------------------
create or replace function private.check_student_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.student_id and p.role = 'STUDENT') then
    raise exception 'NOT_STUDENT_ACCOUNT' using detail = '学生アカウントではありません。';
  end if;
  return new;
end;
$$;

create trigger student_memberships_check_role
  before insert on public.student_memberships
  for each row execute function private.check_student_role();

create trigger join_requests_check_role
  before insert on public.join_requests
  for each row execute function private.check_student_role();

-- ---------------------------------------------------------------------------
-- 企業名の簡易正規化 (企業別一覧用。完全な名寄せは行わない)
--   全角英数→半角, 小文字化, 空白除去, 法人格表記の除去
-- ---------------------------------------------------------------------------
create or replace function private.normalize_company_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      lower(translate(
        btrim(p_name),
        'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９（）',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789()'
      )),
      '株式会社|有限会社|合同会社|\(株\)|\(有\)|㈱|co\.,?\s*ltd\.?|inc\.?|corp\.?', '', 'g'
    ),
    '[\s　・,.]', '', 'g'
  );
$$;

-- ---------------------------------------------------------------------------
-- applications: version インクリメント, 不変列, 正規化, 作成者/更新者
-- ---------------------------------------------------------------------------
create or replace function private.applications_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := new.created_by;
    new.created_at := now();
  else
    if new.student_id is distinct from old.student_id or new.id is distinct from old.id then
      raise exception 'FORBIDDEN_FIELD' using detail = '応募の所有者は変更できません。';
    end if;
    new.version := old.version + 1;
    new.created_at := old.created_at;
    -- created_by は列権限で更新不可。ON DELETE SET NULL による NULL 化はそのまま許可する
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  if not new.selection_type = 'FULL_TIME' then
    new.is_early_selection := false;
  end if;
  new.company_name := btrim(new.company_name);
  new.company_name_normalized := private.normalize_company_name(new.company_name);
  new.updated_at := now();
  return new;
end;
$$;

create trigger applications_before_write
  before insert or update on public.applications
  for each row execute function private.applications_before_write();

-- ---------------------------------------------------------------------------
-- selection_steps: version インクリメント, application_id 不変
-- ---------------------------------------------------------------------------
create or replace function private.selection_steps_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
  else
    if new.application_id is distinct from old.application_id or new.id is distinct from old.id then
      raise exception 'FORBIDDEN_FIELD' using detail = 'ステップの所属応募は変更できません。';
    end if;
    new.version := old.version + 1;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger selection_steps_before_write
  before insert or update on public.selection_steps
  for each row execute function private.selection_steps_before_write();

-- ---------------------------------------------------------------------------
-- events: student_id 不変, created_by
-- ---------------------------------------------------------------------------
create or replace function private.events_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    if new.student_id is distinct from old.student_id or new.id is distinct from old.id then
      raise exception 'FORBIDDEN_FIELD' using detail = '予定の所有者は変更できません。';
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger events_before_write
  before insert or update on public.events
  for each row execute function private.events_before_write();

-- ---------------------------------------------------------------------------
-- 監査ログ (保存処理と同一トランザクション内で記録)
--   UPDATE は変更された列のみ記録。秘密情報 (token_hash 等) は除外。
-- ---------------------------------------------------------------------------
create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_ignored text[] := array['updated_at', 'version', 'created_by', 'updated_by', 'ended_by', 'company_name_normalized', 'token_hash', 'join_code_hash'];
  v_key text;
  v_old_diff jsonb := '{}'::jsonb;
  v_new_diff jsonb := '{}'::jsonb;
  v_application_id uuid;
  v_student_id uuid;
begin
  if tg_table_name = 'applications' then
    v_application_id := (v_row ->> 'id')::uuid;
    v_student_id := (v_row ->> 'student_id')::uuid;
  elsif tg_table_name = 'selection_steps' then
    v_application_id := (v_row ->> 'application_id')::uuid;
    select a.student_id into v_student_id from public.applications a where a.id = v_application_id;
  elsif tg_table_name = 'events' then
    v_application_id := (v_row ->> 'application_id')::uuid;
    v_student_id := (v_row ->> 'student_id')::uuid;
  elsif tg_table_name = 'student_memberships' then
    v_student_id := (v_row ->> 'student_id')::uuid;
  end if;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if not (v_key = any (v_ignored)) and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_old_diff := v_old_diff || jsonb_build_object(v_key, v_old -> v_key);
        v_new_diff := v_new_diff || jsonb_build_object(v_key, v_new -> v_key);
      end if;
    end loop;
    if v_new_diff = '{}'::jsonb then
      return null; -- 実質的な変更なし
    end if;
    v_old := v_old_diff;
    v_new := v_new_diff;
  else
    v_old := jsonb_strip_nulls(v_old - v_ignored);
    v_new := jsonb_strip_nulls(v_new - v_ignored);
  end if;

  insert into public.audit_logs (actor_id, target_type, target_id, application_id, student_id, action, old_values, new_values)
  values (
    (select p.id from public.profiles p where p.id = auth.uid()),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    v_application_id,
    v_student_id,
    tg_op,
    v_old,
    v_new
  );
  return null;
end;
$$;

create trigger applications_audit
  after insert or update or delete on public.applications
  for each row execute function private.audit_row();
create trigger selection_steps_audit
  after insert or update or delete on public.selection_steps
  for each row execute function private.audit_row();
create trigger events_audit
  after insert or update or delete on public.events
  for each row execute function private.audit_row();
create trigger student_memberships_audit
  after insert or update or delete on public.student_memberships
  for each row execute function private.audit_row();
