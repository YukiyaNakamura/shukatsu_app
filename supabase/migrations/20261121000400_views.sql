-- =============================================================================
-- 読み取り用ビュー (security_invoker = true: 参照元テーブルの RLS がそのまま適用される)
-- =============================================================================

-- 応募一覧 (現在の選考段階・学生名を結合)
create view public.application_overview
with (security_invoker = true)
as
select
  a.id,
  a.student_id,
  a.company_name,
  a.company_name_normalized,
  a.selection_type,
  a.is_early_selection,
  a.job_title,
  a.applied_at,
  a.priority,
  a.application_source,
  a.status,
  a.current_step_id,
  a.version,
  a.created_at,
  a.updated_at,
  a.deleted_at,
  s.step_type as current_step_type,
  s.display_name as current_step_name,
  s.status as current_step_status,
  s.result as current_step_result,
  p.full_name as student_name,
  p.university_name as student_university
from public.applications a
left join public.selection_steps s on s.id = a.current_step_id
left join public.profiles p on p.id = a.student_id;

-- カレンダー項目
--   選考ステップの日時は selection_steps を参照するだけで events には複製しない (二重登録防止)
create view public.calendar_items
with (security_invoker = true)
as
select items.*, p.full_name as student_name
from (
select
  'STEP_SCHEDULE'::text as kind,
  s.id as source_id,
  s.id as step_id,
  a.id as application_id,
  a.student_id,
  s.display_name as title,
  a.company_name,
  s.step_type,
  s.scheduled_at as starts_at,
  null::timestamptz as ends_at,
  s.location,
  s.meeting_url,
  null::text as description
from public.selection_steps s
join public.applications a on a.id = s.application_id
where a.deleted_at is null and s.scheduled_at is not null
union all
select
  'STEP_DEADLINE'::text,
  s.id,
  s.id,
  a.id,
  a.student_id,
  s.display_name,
  a.company_name,
  s.step_type,
  s.deadline_at,
  null::timestamptz,
  null::text,
  null::text,
  null::text
from public.selection_steps s
join public.applications a on a.id = s.application_id
where a.deleted_at is null and s.deadline_at is not null
union all
select
  'EVENT'::text,
  e.id,
  null::uuid,
  e.application_id,
  e.student_id,
  e.title,
  a.company_name,
  null::public.step_type,
  e.starts_at,
  e.ends_at,
  null::text,
  null::text,
  e.description
from public.events e
left join public.applications a on a.id = e.application_id
) as items
left join public.profiles p on p.id = items.student_id;

revoke all on public.application_overview, public.calendar_items from anon, authenticated;
grant select on public.application_overview, public.calendar_items to authenticated;
