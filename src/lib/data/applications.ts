import "server-only";
import { ApiError, unwrap } from "@/lib/api/errors";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { ApplicationFieldsInput } from "@/lib/validations/application";
import type { ApplicationRow, ApplicationStatus, SelectionType, StepType } from "@/types/database";

/** LIKE 検索のワイルドカードをエスケープ */
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type ApplicationFilters = {
  studentId?: string;
  q?: string;
  jobTitle?: string;
  selectionType?: SelectionType;
  stepType?: StepType;
  status?: ApplicationStatus;
  includeDeleted?: boolean;
};

/** 応募一覧 (RLS により本人 / 管理者は自組織の学生分のみ返る) */
export async function listApplications(supabase: ServerSupabase, filters: ApplicationFilters = {}) {
  let query = supabase.from("application_overview").select("*").order("created_at", { ascending: false }).limit(2000);
  if (filters.studentId) query = query.eq("student_id", filters.studentId);
  if (!filters.includeDeleted) query = query.is("deleted_at", null);
  if (filters.q) query = query.ilike("company_name", `%${escapeLike(filters.q)}%`);
  if (filters.jobTitle) query = query.ilike("job_title", `%${escapeLike(filters.jobTitle)}%`);
  if (filters.selectionType) query = query.eq("selection_type", filters.selectionType);
  if (filters.stepType) query = query.eq("current_step_type", filters.stepType);
  if (filters.status) query = query.eq("status", filters.status);
  return unwrap(await query);
}

export async function getApplicationOverview(supabase: ServerSupabase, id: string) {
  return unwrap(await supabase.from("application_overview").select("*").eq("id", id).maybeSingle());
}

export async function getApplication(supabase: ServerSupabase, id: string) {
  const app = unwrap(await supabase.from("applications").select("*").eq("id", id).maybeSingle());
  if (!app) throw new ApiError(404, "NOT_FOUND", "応募が見つかりません。");
  return app;
}

export async function listSteps(supabase: ServerSupabase, applicationId: string) {
  return unwrap(
    await supabase
      .from("selection_steps")
      .select("*")
      .eq("application_id", applicationId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  );
}

export async function getApplicationDetail(supabase: ServerSupabase, id: string) {
  const [application, steps, overview] = await Promise.all([
    getApplication(supabase, id),
    listSteps(supabase, id),
    getApplicationOverview(supabase, id),
  ]);
  return {
    application,
    steps,
    overview,
    student: { id: application.student_id, name: overview?.student_name ?? null, university: overview?.student_university ?? null },
  };
}

export function toApplicationColumns(changes: ApplicationFieldsInput) {
  const map: Partial<Record<keyof ApplicationFieldsInput, keyof ApplicationRow>> = {
    companyName: "company_name",
    selectionType: "selection_type",
    isEarlySelection: "is_early_selection",
    jobTitle: "job_title",
    appliedAt: "applied_at",
    companyUrl: "company_url",
    priority: "priority",
    applicationSource: "application_source",
    status: "status",
    memo: "memo",
  };
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    const column = map[key as keyof ApplicationFieldsInput];
    if (column && value !== undefined) patch[column] = value;
  }
  return patch as Partial<ApplicationRow>;
}

/**
 * 楽観的ロック付き更新。version が一致したときだけ更新し (version はトリガーで +1)、
 * 一致しなければ最新データを添えて 409 を返す。監査ログは同一トランザクションでトリガーが記録。
 */
export async function updateApplicationWithVersion(
  supabase: ServerSupabase,
  id: string,
  expectedVersion: number,
  patch: Partial<ApplicationRow>,
  opts: { allowDeleted?: boolean } = {},
) {
  let query = supabase.from("applications").update(patch).eq("id", id).eq("version", expectedVersion);
  if (!opts.allowDeleted) query = query.is("deleted_at", null);
  const updated = unwrap(await query.select("*").maybeSingle());
  if (updated) return updated;

  const current = unwrap(await supabase.from("applications").select("*").eq("id", id).maybeSingle());
  if (!current) throw new ApiError(404, "NOT_FOUND", "応募が見つかりません。");
  if (current.deleted_at && !opts.allowDeleted) {
    throw new ApiError(410, "APPLICATION_DELETED", "この応募は削除されています。");
  }
  throw new ApiError(409, "VERSION_CONFLICT", "他のユーザーがこの応募を更新しました。最新の内容を確認してください。", {
    current,
  });
}

/** 論理削除 / 復元 (version 非依存) */
export async function setApplicationDeleted(supabase: ServerSupabase, id: string, deleted: boolean) {
  const updated = unwrap(
    await supabase
      .from("applications")
      .update({ deleted_at: deleted ? new Date().toISOString() : null })
      .eq("id", id)
      .select("*")
      .maybeSingle(),
  );
  if (!updated) throw new ApiError(404, "NOT_FOUND", "応募が見つかりません。");
  return updated;
}

/** 変更履歴 (更新者名つき) */
export async function getApplicationHistory(supabase: ServerSupabase, applicationId: string) {
  await getApplication(supabase, applicationId); // アクセス権の確認 (無ければ 404)
  const logs = unwrap(
    await supabase
      .from("audit_logs")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(200),
  );
  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter((x): x is string => Boolean(x)))];
  const actors = actorIds.length
    ? unwrap(await supabase.from("profiles").select("id, full_name, role").in("id", actorIds))
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a]));
  return logs.map((log) => {
    const actor = log.actor_id ? actorMap.get(log.actor_id) : undefined;
    return {
      ...log,
      actor_name: actor?.full_name ?? (log.actor_id ? "組織の管理者" : "システム"),
      actor_role: actor?.role ?? null,
    };
  });
}
export type HistoryEntry = Awaited<ReturnType<typeof getApplicationHistory>>[number];
