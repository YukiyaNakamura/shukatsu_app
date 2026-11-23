import "server-only";
import { and, asc, eq, gte, isNotNull, isNull, lt, type SQL } from "drizzle-orm";
import { applications, events, selectionSteps, user } from "@/db/schema";
import { ApiError, apiError } from "@/lib/api/errors";
import { assertCanAccessStudent, assertStudentAccount, canAccessStudentSql } from "@/lib/server/access";
import { auditIfChanged, auditInsert, diffValues, snapshot } from "@/lib/server/audit";
import type { DataContext } from "@/lib/server/context";
import { nowIso, toUtcIso } from "@/lib/server/time";
import type { CalendarItemRow, EventRow } from "@/types/database";

/**
 * カレンダー項目 (旧 calendar_items ビュー)
 *   選考ステップの日時は selection_steps を参照するだけで events には複製しない (二重登録防止)
 */
export async function listCalendarItems(
  ctx: DataContext,
  range: { from: string; to: string; studentId?: string },
): Promise<CalendarItemRow[]> {
  const from = toUtcIso(range.from);
  const to = toUtcIso(range.to);
  const access = canAccessStudentSql(ctx.actor.id, applications.student_id);
  const byStudent = (col: typeof applications.student_id | typeof events.student_id): SQL | undefined =>
    range.studentId ? eq(col, range.studentId) : undefined;

  const stepRows = (column: typeof selectionSteps.scheduled_at | typeof selectionSteps.deadline_at) =>
    ctx.db
      .select({
        source_id: selectionSteps.id,
        application_id: applications.id,
        student_id: applications.student_id,
        title: selectionSteps.display_name,
        company_name: applications.company_name,
        step_type: selectionSteps.step_type,
        starts_at: column,
        location: selectionSteps.location,
        meeting_url: selectionSteps.meeting_url,
        student_name: user.name,
      })
      .from(selectionSteps)
      .innerJoin(applications, eq(applications.id, selectionSteps.application_id))
      .leftJoin(user, eq(user.id, applications.student_id))
      .where(and(isNull(applications.deleted_at), isNotNull(column), gte(column, from), lt(column, to), access, byStudent(applications.student_id)))
      .limit(2000);

  const [scheduled, deadlines, eventRows] = await Promise.all([
    stepRows(selectionSteps.scheduled_at),
    stepRows(selectionSteps.deadline_at),
    ctx.db
      .select({
        source_id: events.id,
        application_id: events.application_id,
        student_id: events.student_id,
        title: events.title,
        company_name: applications.company_name,
        starts_at: events.starts_at,
        ends_at: events.ends_at,
        description: events.description,
        student_name: user.name,
      })
      .from(events)
      .leftJoin(applications, eq(applications.id, events.application_id))
      .leftJoin(user, eq(user.id, events.student_id))
      .where(and(gte(events.starts_at, from), lt(events.starts_at, to), canAccessStudentSql(ctx.actor.id, events.student_id), byStudent(events.student_id)))
      .limit(2000),
  ]);

  const items: CalendarItemRow[] = [
    ...scheduled.map((s) => ({ ...s, kind: "STEP_SCHEDULE" as const, step_id: s.source_id, starts_at: s.starts_at!, ends_at: null, description: null })),
    ...deadlines.map((s) => ({
      ...s,
      kind: "STEP_DEADLINE" as const,
      step_id: s.source_id,
      starts_at: s.starts_at!,
      ends_at: null,
      location: null,
      meeting_url: null,
      description: null,
    })),
    ...eventRows.map((e) => ({ ...e, kind: "EVENT" as const, step_id: null, step_type: null, location: null, meeting_url: null })),
  ];
  return items.sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 2000);
}

export async function listEvents(ctx: DataContext, studentId?: string): Promise<EventRow[]> {
  return ctx.db
    .select()
    .from(events)
    .where(and(canAccessStudentSql(ctx.actor.id, events.student_id), studentId ? eq(events.student_id, studentId) : undefined))
    .orderBy(asc(events.starts_at));
}

function eventAudit(ctx: DataContext, e: Pick<EventRow, "id" | "student_id" | "application_id">, action: "INSERT" | "UPDATE" | "DELETE", values: { old: object | null; new: object | null }) {
  return {
    actorId: ctx.actor.id,
    targetType: "events" as const,
    targetId: e.id,
    applicationId: e.application_id,
    studentId: e.student_id,
    action,
    oldValues: values.old as Record<string, unknown> | null,
    newValues: values.new as Record<string, unknown> | null,
  };
}

/** 紐づける応募は同じ学生のものに限る (複合外部キーでも保証) */
async function assertApplicationOfStudent(ctx: DataContext, applicationId: string | null | undefined, studentId: string) {
  if (!applicationId) return;
  const app = await ctx.db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.student_id, studentId)))
    .get();
  if (!app) throw apiError("NOT_FOUND", "紐づける応募が見つかりません。");
}

export type EventInput = {
  studentId?: string;
  applicationId?: string | null;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  description?: string | null;
};

/** 独立予定の作成 (管理者は所属学生の予定も作成できる) */
export async function createEvent(ctx: DataContext, input: EventInput): Promise<EventRow> {
  const studentId = input.studentId ?? ctx.actor.id;
  await assertCanAccessStudent(ctx, studentId);
  await assertStudentAccount(ctx, studentId);
  await assertApplicationOfStudent(ctx, input.applicationId, studentId);
  const now = nowIso();
  const event = {
    id: crypto.randomUUID(),
    student_id: studentId,
    application_id: input.applicationId ?? null,
    title: input.title.trim(),
    starts_at: toUtcIso(input.startsAt),
    ends_at: toUtcIso(input.endsAt ?? null),
    description: input.description ?? null,
    created_by: ctx.actor.id,
    created_at: now,
    updated_at: now,
  } satisfies EventRow;
  const [rows] = (await ctx.db.batch([
    ctx.db.insert(events).values(event).returning(),
    auditInsert(ctx.db, eventAudit(ctx, event, "INSERT", { old: null, new: snapshot(event) })),
  ])) as [EventRow[], unknown];
  return rows[0];
}

async function findEvent(ctx: DataContext, id: string) {
  return ctx.db
    .select()
    .from(events)
    .where(and(eq(events.id, id), canAccessStudentSql(ctx.actor.id, events.student_id)))
    .get();
}

export async function updateEvent(ctx: DataContext, id: string, input: Partial<Omit<EventInput, "studentId">>): Promise<EventRow> {
  const current = await findEvent(ctx, id);
  if (!current) throw apiError("NOT_FOUND", "予定が見つかりません。");
  const patch: Partial<EventRow> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.startsAt !== undefined) patch.starts_at = toUtcIso(input.startsAt);
  if (input.endsAt !== undefined) patch.ends_at = toUtcIso(input.endsAt);
  if (input.description !== undefined) patch.description = input.description;
  if (input.applicationId !== undefined) {
    await assertApplicationOfStudent(ctx, input.applicationId, current.student_id);
    patch.application_id = input.applicationId;
  }
  const startsAt = patch.starts_at ?? current.starts_at;
  const endsAt = patch.ends_at !== undefined ? patch.ends_at : current.ends_at;
  // 片方だけ更新する場合も、保存済みの値と組み合わせて前後関係を確認する
  if (endsAt && endsAt < startsAt) {
    const message = "終了日時は開始日時より後にしてください";
    throw new ApiError(422, "VALIDATION_FAILED", message, { fieldErrors: { endsAt: message } });
  }
  const diff = diffValues(current, patch);
  const [rows] = (await ctx.db.batch([
    ctx.db
      .update(events)
      .set({ ...patch, updated_at: nowIso() })
      .where(and(eq(events.id, id), canAccessStudentSql(ctx.actor.id, events.student_id)))
      .returning(),
    ...(diff ? [auditIfChanged(ctx.db, eventAudit(ctx, { ...current, ...patch }, "UPDATE", diff))] : []),
  ])) as [EventRow[], ...unknown[]];
  if (!rows[0]) throw apiError("NOT_FOUND", "予定が見つかりません。");
  return rows[0];
}

export async function deleteEvent(ctx: DataContext, id: string) {
  const current = await findEvent(ctx, id);
  if (!current) throw apiError("NOT_FOUND", "予定が見つかりません。");
  await ctx.db.batch([
    ctx.db.delete(events).where(and(eq(events.id, id), canAccessStudentSql(ctx.actor.id, events.student_id))),
    auditIfChanged(ctx.db, eventAudit(ctx, current, "DELETE", { old: snapshot(current), new: null })),
  ]);
  return { id };
}
