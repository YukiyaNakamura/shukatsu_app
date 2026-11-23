import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { applications, auditLogs, organizationMembers, selectionSteps, user } from "@/db/schema";
import { apiError } from "@/lib/api/errors";
import {
  assertCanAccessStudent,
  assertStudentAccount,
  canAccessStudentSql,
  getActiveStudentOrgId,
} from "@/lib/server/access";
import { auditIfChanged, auditInsert, diffValues, insertWhere, snapshot } from "@/lib/server/audit";
import type { DataContext } from "@/lib/server/context";
import { normalizeCompanyName, STEP_TEMPLATES } from "@/lib/server/normalize";
import { nowIso } from "@/lib/server/time";
import { STEP_TYPE_LABELS } from "@/lib/constants";
import type { ApplicationFieldsInput, CreateApplicationInput } from "@/lib/validations/application";
import type {
  ApplicationOverviewRow,
  ApplicationRow,
  ApplicationStatus,
  SelectionStepRow,
  SelectionType,
  StepType,
} from "@/types/database";

/** LIKE 検索のワイルドカードをエスケープ (ESCAPE '\' と組み合わせて使う) */
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** 部分一致 (SQLite の LIKE は ASCII の大文字・小文字を区別しない) */
export function containsSql(column: SQL | Parameters<typeof eq>[0], value: string) {
  return sql`${column} like ${`%${escapeLike(value)}%`} escape '\\'`;
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

/** 「actor がこのステップの応募にアクセスできる」 */
export function stepAccessSql(actorId: string) {
  return sql`exists (select 1 from applications a where a.id = ${selectionSteps.application_id} and ${canAccessStudentSql(actorId, sql`a.student_id`)})`;
}

/** 応募一覧の 1 行 (現在の選考段階・学生名を結合)。旧 application_overview ビュー */
const overviewFields = {
  id: applications.id,
  student_id: applications.student_id,
  company_name: applications.company_name,
  company_name_normalized: applications.company_name_normalized,
  selection_type: applications.selection_type,
  is_early_selection: applications.is_early_selection,
  job_title: applications.job_title,
  applied_at: applications.applied_at,
  priority: applications.priority,
  application_source: applications.application_source,
  status: applications.status,
  current_step_id: applications.current_step_id,
  version: applications.version,
  created_at: applications.created_at,
  updated_at: applications.updated_at,
  deleted_at: applications.deleted_at,
  current_step_type: selectionSteps.step_type,
  current_step_name: selectionSteps.display_name,
  current_step_status: selectionSteps.status,
  current_step_result: selectionSteps.result,
  student_name: user.name,
  student_university: user.universityName,
};

function selectOverview(ctx: DataContext) {
  return ctx.db
    .select(overviewFields)
    .from(applications)
    .leftJoin(selectionSteps, eq(selectionSteps.id, applications.current_step_id))
    .leftJoin(user, eq(user.id, applications.student_id));
}

/** 応募一覧 (本人分 / 管理者は自組織に所属する学生分のみ) */
export async function listApplications(ctx: DataContext, filters: ApplicationFilters = {}): Promise<ApplicationOverviewRow[]> {
  const conditions: (SQL | undefined)[] = [canAccessStudentSql(ctx.actor.id, applications.student_id)];
  if (filters.studentId) conditions.push(eq(applications.student_id, filters.studentId));
  if (!filters.includeDeleted) conditions.push(isNull(applications.deleted_at));
  if (filters.q) conditions.push(containsSql(applications.company_name, filters.q));
  if (filters.jobTitle) conditions.push(containsSql(applications.job_title, filters.jobTitle));
  if (filters.selectionType) conditions.push(eq(applications.selection_type, filters.selectionType));
  if (filters.stepType) conditions.push(eq(selectionSteps.step_type, filters.stepType));
  if (filters.status) conditions.push(eq(applications.status, filters.status));
  return selectOverview(ctx)
    .where(and(...conditions))
    .orderBy(desc(applications.created_at))
    .limit(2000);
}

export async function getApplicationOverview(ctx: DataContext, id: string): Promise<ApplicationOverviewRow | null> {
  return (
    (await selectOverview(ctx)
      .where(and(eq(applications.id, id), canAccessStudentSql(ctx.actor.id, applications.student_id)))
      .get()) ?? null
  );
}

async function findApplication(ctx: DataContext, id: string) {
  return ctx.db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), canAccessStudentSql(ctx.actor.id, applications.student_id)))
    .get();
}

/** 応募 (アクセスできなければ存在しない扱いで 404) */
export async function getApplication(ctx: DataContext, id: string): Promise<ApplicationRow> {
  const app = await findApplication(ctx, id);
  if (!app) throw apiError("NOT_FOUND", "応募が見つかりません。");
  return app;
}

export async function listSteps(ctx: DataContext, applicationId: string): Promise<SelectionStepRow[]> {
  return ctx.db
    .select()
    .from(selectionSteps)
    .where(and(eq(selectionSteps.application_id, applicationId), stepAccessSql(ctx.actor.id)))
    .orderBy(asc(selectionSteps.position), asc(selectionSteps.created_at));
}

export async function getApplicationDetail(ctx: DataContext, id: string) {
  const [application, steps, overview] = await Promise.all([
    getApplication(ctx, id),
    listSteps(ctx, id),
    getApplicationOverview(ctx, id),
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

/** 更新できる列 (所有者・作成者・version などはサービス層が管理する) */
type ApplicationPatch = Partial<
  Pick<
    ApplicationRow,
    | "company_name"
    | "selection_type"
    | "is_early_selection"
    | "job_title"
    | "applied_at"
    | "company_url"
    | "priority"
    | "application_source"
    | "status"
    | "current_step_id"
    | "memo"
  >
>;

/** 旧トリガー applications_before_write と同じ正規化 */
function normalizePatch(current: ApplicationRow, patch: ApplicationPatch): ApplicationPatch & { company_name_normalized?: string } {
  const allowed: (keyof ApplicationPatch)[] = [
    "company_name",
    "selection_type",
    "is_early_selection",
    "job_title",
    "applied_at",
    "company_url",
    "priority",
    "application_source",
    "status",
    "current_step_id",
    "memo",
  ];
  const next: ApplicationPatch & { company_name_normalized?: string } = {};
  for (const key of allowed) if (patch[key] !== undefined) Object.assign(next, { [key]: patch[key] });
  if (next.company_name !== undefined) {
    next.company_name = next.company_name.trim();
    next.company_name_normalized = normalizeCompanyName(next.company_name);
  }
  // 早期選考は本選考 (FULL_TIME) のみ
  if ((next.selection_type ?? current.selection_type) !== "FULL_TIME" && (current.is_early_selection || next.is_early_selection)) {
    next.is_early_selection = false;
  }
  return next;
}

function applicationAudit(ctx: DataContext, app: Pick<ApplicationRow, "id" | "student_id">, action: "INSERT" | "UPDATE" | "DELETE", values: { old: object | null; new: object | null }) {
  return {
    actorId: ctx.actor.id,
    targetType: "applications" as const,
    targetId: app.id,
    applicationId: app.id,
    studentId: app.student_id,
    action,
    oldValues: values.old as Record<string, unknown> | null,
    newValues: values.new as Record<string, unknown> | null,
  };
}

/** 楽観的ロックに失敗したとき、原因に応じたエラーを投げる */
async function throwWriteFailure(ctx: DataContext, id: string, allowDeleted = false): Promise<never> {
  const current = await findApplication(ctx, id);
  if (!current) throw apiError("NOT_FOUND", "応募が見つかりません。");
  if (current.deleted_at && !allowDeleted) throw apiError("APPLICATION_DELETED");
  throw apiError("VERSION_CONFLICT", undefined, { current });
}

type Batch = [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];

/**
 * 楽観的ロック付き更新。version が一致したときだけ更新して version を +1 し、
 * 一致しなければ最新データを添えて 409 を返す。監査ログは同じ batch (トランザクション) で記録する。
 */
export async function updateApplicationWithVersion(
  ctx: DataContext,
  id: string,
  expectedVersion: number,
  patch: ApplicationPatch,
  opts: { allowDeleted?: boolean } = {},
): Promise<ApplicationRow> {
  const current = await findApplication(ctx, id);
  if (!current) throw apiError("NOT_FOUND", "応募が見つかりません。");
  if (current.deleted_at && !opts.allowDeleted) throw apiError("APPLICATION_DELETED");
  if (current.version !== expectedVersion) throw apiError("VERSION_CONFLICT", undefined, { current });

  const changes = normalizePatch(current, patch);
  const diff = diffValues(current, changes);
  const update = ctx.db
    .update(applications)
    .set({ ...changes, version: sql`${applications.version} + 1`, updated_at: nowIso(), updated_by: ctx.actor.id })
    .where(
      and(
        eq(applications.id, id),
        eq(applications.version, expectedVersion),
        canAccessStudentSql(ctx.actor.id, applications.student_id),
        opts.allowDeleted ? undefined : isNull(applications.deleted_at),
      ),
    )
    .returning();
  const items: Batch = [update];
  if (diff) items.push(auditIfChanged(ctx.db, applicationAudit(ctx, current, "UPDATE", diff)));
  const [rows] = (await ctx.db.batch(items)) as [ApplicationRow[], ...unknown[]];
  return rows[0] ?? throwWriteFailure(ctx, id, opts.allowDeleted);
}

/** 論理削除 / 復元 (version に依存しない。version は +1 される) */
export async function setApplicationDeleted(ctx: DataContext, id: string, deleted: boolean): Promise<ApplicationRow> {
  const current = await getApplication(ctx, id);
  const deletedAt = deleted ? (current.deleted_at ?? nowIso()) : null;
  const diff = diffValues(current, { deleted_at: deletedAt });
  const items: Batch = [
    ctx.db
      .update(applications)
      .set({ deleted_at: deletedAt, version: sql`${applications.version} + 1`, updated_at: nowIso(), updated_by: ctx.actor.id })
      .where(and(eq(applications.id, id), canAccessStudentSql(ctx.actor.id, applications.student_id)))
      .returning(),
  ];
  if (diff) items.push(auditIfChanged(ctx.db, applicationAudit(ctx, current, "UPDATE", diff)));
  const [rows] = (await ctx.db.batch(items)) as [ApplicationRow[], ...unknown[]];
  if (!rows[0]) throw apiError("NOT_FOUND", "応募が見つかりません。");
  return rows[0];
}

/** 応募作成 + テンプレートからステップ生成 (旧 RPC create_application) */
export type CreateApplicationArgs = Pick<CreateApplicationInput, "companyName" | "selectionType"> &
  Partial<Pick<CreateApplicationInput, "studentId" | "isEarlySelection" | "jobTitle" | "status" | "useTemplate">>;

export async function createApplication(ctx: DataContext, input: CreateApplicationArgs): Promise<ApplicationOverviewRow> {
  const studentId = input.studentId ?? ctx.actor.id;
  // 代理登録は「自組織に所属する学生」に限る
  await assertCanAccessStudent(ctx, studentId);
  await assertStudentAccount(ctx, studentId);

  const now = nowIso();
  const id = crypto.randomUUID();
  const companyName = input.companyName.trim();
  const app = {
    id,
    student_id: studentId,
    company_name: companyName,
    company_name_normalized: normalizeCompanyName(companyName),
    selection_type: input.selectionType,
    is_early_selection: input.selectionType === "FULL_TIME" ? Boolean(input.isEarlySelection) : false,
    job_title: input.jobTitle?.trim() || null,
    status: input.status ?? "PLANNED",
    version: 1,
    created_by: ctx.actor.id,
    updated_by: ctx.actor.id,
    created_at: now,
    updated_at: now,
  } satisfies Partial<ApplicationRow>;
  const steps = (input.useTemplate === false ? [] : STEP_TEMPLATES[input.selectionType]).map((t, position) => ({
    id: crypto.randomUUID(),
    application_id: id,
    step_type: t.step_type,
    display_name: t.display_name,
    position,
    status: "NOT_STARTED" as const,
    version: 1,
    created_at: now,
    updated_at: now,
  }));
  const currentStepId = steps[0]?.id ?? null;

  const items: Batch = [ctx.db.insert(applications).values(app)];
  if (steps.length) {
    // 現在段階は複合外部キーで「同じ応募のステップ」に限定されるため、ステップの追加後に設定する
    items.push(ctx.db.insert(selectionSteps).values(steps));
    items.push(ctx.db.update(applications).set({ current_step_id: currentStepId }).where(eq(applications.id, id)));
  }
  items.push(auditInsert(ctx.db, applicationAudit(ctx, app, "INSERT", { old: null, new: snapshot({ ...app, current_step_id: currentStepId }) })));
  for (const step of steps) {
    items.push(auditInsert(ctx.db, stepAudit(ctx, step, studentId, "INSERT", { old: null, new: snapshot(step) })));
  }
  await ctx.db.batch(items);
  return (await getApplicationOverview(ctx, id))!;
}

// =============================================================================
// 選考ステップ
// =============================================================================

function stepAudit(
  ctx: DataContext,
  step: Pick<SelectionStepRow, "id" | "application_id">,
  studentId: string,
  action: "INSERT" | "UPDATE" | "DELETE",
  values: { old: object | null; new: object | null },
) {
  return {
    actorId: ctx.actor.id,
    targetType: "selection_steps" as const,
    targetId: step.id,
    applicationId: step.application_id,
    studentId,
    action,
    oldValues: values.old as Record<string, unknown> | null,
    newValues: values.new as Record<string, unknown> | null,
  };
}

function isDone(status: SelectionStepRow["status"]) {
  return status === "COMPLETED" || status === "SKIPPED";
}

/**
 * 一覧の「現在の選考段階」変更 (楽観的ロック付き。旧 RPC set_current_stage)
 *   既存の同種ステップ (現在段階 → 未完了 → 新しい順) を現在段階にし、無ければ末尾に追加する
 */
export async function setCurrentStage(ctx: DataContext, id: string, stepType: StepType, expectedVersion: number) {
  const app = await getApplication(ctx, id);
  if (app.deleted_at) throw apiError("APPLICATION_DELETED");
  if (app.version !== expectedVersion) throw apiError("VERSION_CONFLICT", undefined, { current: app });

  const steps = await listSteps(ctx, id);
  const rank = (s: SelectionStepRow) => [s.id === app.current_step_id ? 0 : 1, isDone(s.status) ? 1 : 0, isDone(s.status) ? -s.position : s.position];
  const target = steps
    .filter((s) => s.step_type === stepType)
    .sort((a, b) => {
      const [ra, rb] = [rank(a), rank(b)];
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
    })[0];

  // 応募が読み込み時の version のままであることを、同じトランザクション内の各文の条件にする
  const unchanged = sql`exists (select 1 from applications a where a.id = ${id} and a.version = ${expectedVersion} and a.deleted_at is null and ${canAccessStudentSql(ctx.actor.id, sql`a.student_id`)})`;
  const items: BatchItem<"sqlite">[] = [];
  let stepId = target?.id;
  if (!target) {
    const now = nowIso();
    const step = {
      id: crypto.randomUUID(),
      application_id: id,
      step_type: stepType,
      display_name: STEP_TYPE_LABELS[stepType],
      position: steps.length ? Math.max(...steps.map((s) => s.position)) + 1 : 0,
      status: "NOT_STARTED",
      version: 1,
      created_at: now,
      updated_at: now,
    };
    stepId = step.id;
    items.push(insertWhere(ctx.db, "selection_steps", step, unchanged));
    items.push(auditIfChanged(ctx.db, stepAudit(ctx, step, app.student_id, "INSERT", { old: null, new: snapshot(step) })));
  }
  items.push(
    ctx.db
      .update(applications)
      .set({ current_step_id: stepId, version: sql`${applications.version} + 1`, updated_at: nowIso(), updated_by: ctx.actor.id })
      .where(and(eq(applications.id, id), eq(applications.version, expectedVersion), isNull(applications.deleted_at), canAccessStudentSql(ctx.actor.id, applications.student_id)))
      .returning(),
  );
  const diff = diffValues(app, { current_step_id: stepId ?? null });
  if (diff) items.push(auditIfChanged(ctx.db, applicationAudit(ctx, app, "UPDATE", diff)));
  const results = await ctx.db.batch(items as Batch);
  const updated = results[target ? 0 : 2] as ApplicationRow[];
  return updated[0] ?? throwWriteFailure(ctx, id);
}

/** 指定したステップを現在段階にする (同じ応募のステップのみ。複合外部キーでも保証) */
export async function setCurrentStep(ctx: DataContext, id: string, stepId: string | null, expectedVersion: number) {
  if (stepId) {
    const step = await ctx.db
      .select({ id: selectionSteps.id })
      .from(selectionSteps)
      .where(and(eq(selectionSteps.id, stepId), eq(selectionSteps.application_id, id)))
      .get();
    if (!step) throw apiError("NOT_FOUND", "選考ステップが見つかりません。");
  }
  return updateApplicationWithVersion(ctx, id, expectedVersion, { current_step_id: stepId });
}

/** ステップの並べ替え (指定された順に position を振り直す。全ステップの指定が必要) */
export async function reorderSteps(ctx: DataContext, applicationId: string, stepIds: string[]) {
  const app = await getApplication(ctx, applicationId);
  const steps = await listSteps(ctx, applicationId);
  const known = new Set(steps.map((s) => s.id));
  if (steps.length !== stepIds.length || new Set(stepIds).size !== stepIds.length || stepIds.some((s) => !known.has(s))) {
    throw apiError("INVALID_STEP_ORDER");
  }
  const byId = new Map(steps.map((s) => [s.id, s]));
  const items: BatchItem<"sqlite">[] = [];
  stepIds.forEach((stepId, position) => {
    const step = byId.get(stepId)!;
    if (step.position === position) return;
    items.push(
      ctx.db
        .update(selectionSteps)
        .set({ position, version: sql`${selectionSteps.version} + 1`, updated_at: nowIso() })
        .where(and(eq(selectionSteps.id, stepId), eq(selectionSteps.application_id, applicationId))),
    );
    items.push(auditIfChanged(ctx.db, stepAudit(ctx, step, app.student_id, "UPDATE", { old: { position: step.position }, new: { position } })));
  });
  if (items.length) await ctx.db.batch(items as Batch);
  return listSteps(ctx, applicationId);
}

export type StepInsert = Pick<SelectionStepRow, "step_type" | "display_name"> &
  Partial<Pick<SelectionStepRow, "position" | "status" | "result" | "scheduled_at" | "deadline_at" | "location" | "meeting_url" | "notes">>;

/** ステップ追加 (同じ種類のステップも複数登録できる) */
export async function createStep(ctx: DataContext, applicationId: string, input: StepInsert): Promise<SelectionStepRow> {
  const app = await getApplication(ctx, applicationId);
  if (app.deleted_at) throw apiError("APPLICATION_DELETED", "削除済みの応募にはステップを追加できません。");
  let position = input.position;
  if (position === undefined) {
    const last = await ctx.db
      .select({ position: selectionSteps.position })
      .from(selectionSteps)
      .where(eq(selectionSteps.application_id, applicationId))
      .orderBy(desc(selectionSteps.position))
      .limit(1)
      .get();
    position = last ? last.position + 1 : 0;
  }
  const now = nowIso();
  const step = {
    id: crypto.randomUUID(),
    application_id: applicationId,
    step_type: input.step_type,
    display_name: input.display_name.trim(),
    position,
    status: input.status ?? (input.scheduled_at ? "SCHEDULED" : "NOT_STARTED"),
    result: input.result ?? null,
    scheduled_at: input.scheduled_at ?? null,
    deadline_at: input.deadline_at ?? null,
    location: input.location ?? null,
    meeting_url: input.meeting_url ?? null,
    notes: input.notes ?? null,
    version: 1,
    created_at: now,
    updated_at: now,
  } satisfies SelectionStepRow;
  const [rows] = (await ctx.db.batch([
    ctx.db.insert(selectionSteps).values(step).returning(),
    auditInsert(ctx.db, stepAudit(ctx, step, app.student_id, "INSERT", { old: null, new: snapshot(step) })),
  ])) as [SelectionStepRow[], unknown];
  return rows[0];
}

async function findStep(ctx: DataContext, id: string) {
  return ctx.db
    .select({ step: selectionSteps, student_id: applications.student_id, current_step_id: applications.current_step_id })
    .from(selectionSteps)
    .innerJoin(applications, eq(applications.id, selectionSteps.application_id))
    .where(and(eq(selectionSteps.id, id), canAccessStudentSql(ctx.actor.id, applications.student_id)))
    .get();
}

type StepPatch = Partial<
  Pick<SelectionStepRow, "step_type" | "display_name" | "status" | "result" | "scheduled_at" | "deadline_at" | "location" | "meeting_url" | "notes">
>;

/** 楽観的ロック付きのステップ更新 */
export async function updateStepWithVersion(ctx: DataContext, id: string, expectedVersion: number, patch: StepPatch): Promise<SelectionStepRow> {
  const found = await findStep(ctx, id);
  if (!found) throw apiError("NOT_FOUND", "選考ステップが見つかりません。");
  const current = found.step;
  const conflict = () =>
    apiError("VERSION_CONFLICT", "他のユーザーがこのステップを更新しました。最新の内容を確認してください。", { current });
  if (current.version !== expectedVersion) throw conflict();

  const changes: StepPatch = {};
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) Object.assign(changes, { [key]: value });
  if (changes.display_name !== undefined) changes.display_name = changes.display_name.trim();
  const diff = diffValues(current, changes);
  const items: Batch = [
    ctx.db
      .update(selectionSteps)
      .set({ ...changes, version: sql`${selectionSteps.version} + 1`, updated_at: nowIso() })
      .where(and(eq(selectionSteps.id, id), eq(selectionSteps.version, expectedVersion), stepAccessSql(ctx.actor.id)))
      .returning(),
  ];
  if (diff) items.push(auditIfChanged(ctx.db, stepAudit(ctx, current, found.student_id, "UPDATE", diff)));
  const [rows] = (await ctx.db.batch(items)) as [SelectionStepRow[], ...unknown[]];
  if (rows[0]) return rows[0];
  const latest = await findStep(ctx, id);
  if (!latest) throw apiError("NOT_FOUND", "選考ステップが見つかりません。");
  throw apiError("VERSION_CONFLICT", "他のユーザーがこのステップを更新しました。最新の内容を確認してください。", { current: latest.step });
}

/** ステップ削除。現在段階だった場合は応募の現在段階を未設定にする */
export async function deleteStep(ctx: DataContext, id: string) {
  const found = await findStep(ctx, id);
  if (!found) throw apiError("NOT_FOUND", "選考ステップが見つかりません。");
  const { step, student_id: studentId } = found;
  const items: BatchItem<"sqlite">[] = [];
  if (found.current_step_id === id) {
    // 複合外部キーの参照元を先に外す (SQLite は列指定の ON DELETE SET NULL に対応しないため)
    items.push(
      ctx.db
        .update(applications)
        .set({ current_step_id: null, version: sql`${applications.version} + 1`, updated_at: nowIso(), updated_by: ctx.actor.id })
        .where(and(eq(applications.id, step.application_id), eq(applications.current_step_id, id))),
    );
    items.push(
      auditIfChanged(
        ctx.db,
        applicationAudit(ctx, { id: step.application_id, student_id: studentId }, "UPDATE", { old: { current_step_id: id }, new: { current_step_id: null } }),
      ),
    );
  }
  items.push(ctx.db.delete(selectionSteps).where(and(eq(selectionSteps.id, id), stepAccessSql(ctx.actor.id))));
  items.push(auditIfChanged(ctx.db, stepAudit(ctx, step, studentId, "DELETE", { old: snapshot(step), new: null })));
  await ctx.db.batch(items as Batch);
  return { id, application_id: step.application_id };
}

// =============================================================================
// 変更履歴
// =============================================================================

/**
 * 変更履歴 (更新者名つき)
 *   学生本人はすべて。管理者は「現在の所属を開始した時点以降」の応募・ステップ・予定のログのみ
 *   (同意前の履歴や、他組織への所属履歴は共有しない)
 */
export async function getApplicationHistory(ctx: DataContext, applicationId: string) {
  const app = await getApplication(ctx, applicationId); // アクセス権の確認 (無ければ 404)
  const isOwner = app.student_id === ctx.actor.id;
  let visibleSince: string | null = null;
  if (!isOwner) {
    const row = await ctx.db.all<{ joined_at: string }>(sql`
      select sm.joined_at from student_memberships sm
      join organization_members om on om.organization_id = sm.organization_id
      where sm.student_id = ${app.student_id} and sm.status = 'ACTIVE' and om.user_id = ${ctx.actor.id}`);
    visibleSince = row[0]?.joined_at ?? null;
    if (!visibleSince) return [];
  }
  const logs = await ctx.db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.application_id, applicationId),
        isOwner
          ? undefined
          : and(inArray(auditLogs.target_type, ["applications", "selection_steps", "events"]), sql`${auditLogs.created_at} >= ${visibleSince}`),
      ),
    )
    .orderBy(desc(auditLogs.created_at), desc(auditLogs.id))
    .limit(200);

  // 氏名を表示できるのは本人・対象の学生・学生が所属する組織の管理者のみ (それ以外は「組織の管理者」)
  const orgId = await getActiveStudentOrgId(ctx, app.student_id);
  const orgAdmins = orgId
    ? (await ctx.db.select({ id: organizationMembers.user_id }).from(organizationMembers).where(eq(organizationMembers.organization_id, orgId))).map((m) => m.id)
    : [];
  const visible = new Set([ctx.actor.id, app.student_id, ...orgAdmins]);
  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter((x): x is string => Boolean(x) && visible.has(x!)))];
  const actors = actorIds.length
    ? await ctx.db.select({ id: user.id, full_name: user.name, role: user.role }).from(user).where(inArray(user.id, actorIds))
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
