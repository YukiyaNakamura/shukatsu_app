import "server-only";
import { and, asc, count, desc, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  applications,
  invitations,
  joinCodeFailures,
  joinRequests,
  organizationMembers,
  organizations,
  studentMemberships,
  user,
} from "@/db/schema";
import { ApiError, apiError, fromDbError } from "@/lib/api/errors";
import { canAccessStudentSql, getMyOrgMembership, requireOrgMembership } from "@/lib/server/access";
import { auditIfChanged, insertWhere, snapshot } from "@/lib/server/audit";
import type { DataContext } from "@/lib/server/context";
import { normalizeJoinCode, randomJoinCode, randomToken, sha256Hex } from "@/lib/server/crypto";
import { addDays, nowIso } from "@/lib/server/time";
import { STALE_STUDENT_DAYS } from "@/lib/constants";
import type { DB } from "@/db";
import type { StudentMembershipRow, StudentOverviewRow } from "@/types/database";
import { listCalendarItems } from "./calendar";

type Batch = [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];

/** 組織コード入力の失敗がこの回数に達すると 1 時間ロックする */
const JOIN_CODE_MAX_FAILURES = 10;
const INVITATION_TTL_DAYS = 7;

// =============================================================================
// 参照
// =============================================================================

/** 管理者: 所属学生の一覧と集計 (旧 RPC org_student_overview) */
export async function listOrgStudents(ctx: DataContext): Promise<StudentOverviewRow[]> {
  const rows = await ctx.db.all<StudentOverviewRow & { last_updated_at: string }>(sql`
    select
      p.id as student_id,
      sm.id as membership_id,
      p.name as full_name,
      p.university_name,
      sm.joined_at,
      (select count(*) from applications a where a.student_id = p.id and a.deleted_at is null) as application_count,
      (select count(*) from applications a where a.student_id = p.id and a.deleted_at is null and a.status = 'IN_PROGRESS') as in_progress_count,
      (select count(*) from applications a where a.student_id = p.id and a.deleted_at is null and a.status = 'ACCEPTED') as accepted_count,
      max(
        coalesce((select max(a.updated_at) from applications a where a.student_id = p.id), ''),
        coalesce((select max(s.updated_at) from selection_steps s join applications a2 on a2.id = s.application_id where a2.student_id = p.id), ''),
        coalesce((select max(e.updated_at) from events e where e.student_id = p.id), '')
      ) as last_updated_at
    from student_memberships sm
    join "user" p on p.id = sm.student_id
    where sm.status = 'ACTIVE'
      and sm.organization_id = (select om.organization_id from organization_members om where om.user_id = ${ctx.actor.id})
    order by p.name`);
  return rows.map((r) => ({
    ...r,
    application_count: Number(r.application_count),
    in_progress_count: Number(r.in_progress_count),
    accepted_count: Number(r.accepted_count),
    last_updated_at: r.last_updated_at || null,
  }));
}
export type OrgStudent = Awaited<ReturnType<typeof listOrgStudents>>[number];

export async function getOrgDashboard(ctx: DataContext) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_STUDENT_DAYS * 86_400_000).toISOString();
  const countByStatus = async (status: "IN_PROGRESS" | "ACCEPTED") =>
    (
      await ctx.db
        .select({ n: count() })
        .from(applications)
        .where(and(isNull(applications.deleted_at), eq(applications.status, status), canAccessStudentSql(ctx.actor.id, applications.student_id)))
        .get()
    )?.n ?? 0;

  const [students, inProgressCount, acceptedCount, upcoming] = await Promise.all([
    listOrgStudents(ctx),
    countByStatus("IN_PROGRESS"),
    countByStatus("ACCEPTED"),
    listCalendarItems(ctx, { from: now.toISOString(), to: addDays(now.toISOString(), 14) }),
  ]);
  return {
    studentCount: students.length,
    inProgressCount,
    acceptedCount,
    upcoming: upcoming.slice(0, 30),
    staleStudents: students
      .filter((s) => !s.last_updated_at || s.last_updated_at < staleBefore)
      .sort((a, b) => (a.last_updated_at ?? "").localeCompare(b.last_updated_at ?? "")),
    staleDays: STALE_STUDENT_DAYS,
  };
}

async function isOrgAdmin(db: DB, userId: string, organizationId: string, ownerOnly = false) {
  const row = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organization_id, organizationId),
        eq(organizationMembers.user_id, userId),
        ownerOnly ? eq(organizationMembers.role, "OWNER") : undefined,
      ),
    )
    .get();
  return Boolean(row);
}

async function isActiveMemberOfOrg(db: DB, studentId: string, organizationId: string) {
  const row = await db
    .select({ id: studentMemberships.id })
    .from(studentMemberships)
    .where(and(eq(studentMemberships.organization_id, organizationId), eq(studentMemberships.student_id, studentId), eq(studentMemberships.status, "ACTIVE")))
    .get();
  return Boolean(row);
}

/** 組織の管理者一覧 (同じ組織の管理者と、所属学生のみ閲覧可) */
export async function listOrgMembers(ctx: DataContext, organizationId: string) {
  const allowed =
    (await isOrgAdmin(ctx.db, ctx.actor.id, organizationId)) || (await isActiveMemberOfOrg(ctx.db, ctx.actor.id, organizationId));
  if (!allowed) return [];
  return ctx.db
    .select({
      id: organizationMembers.id,
      organization_id: organizationMembers.organization_id,
      user_id: organizationMembers.user_id,
      role: organizationMembers.role,
      joined_at: organizationMembers.joined_at,
      full_name: user.name,
    })
    .from(organizationMembers)
    .innerJoin(user, eq(user.id, organizationMembers.user_id))
    .where(eq(organizationMembers.organization_id, organizationId))
    .orderBy(asc(organizationMembers.joined_at));
}

/** 招待の一覧 (トークンのハッシュは返さない) */
export async function listInvitations(ctx: DataContext, organizationId: string) {
  if (!(await isOrgAdmin(ctx.db, ctx.actor.id, organizationId))) return [];
  return ctx.db
    .select({
      id: invitations.id,
      organization_id: invitations.organization_id,
      email: invitations.email,
      invitee_role: invitations.invitee_role,
      created_by: invitations.created_by,
      expires_at: invitations.expires_at,
      used_at: invitations.used_at,
      used_by: invitations.used_by,
      revoked_at: invitations.revoked_at,
      created_at: invitations.created_at,
    })
    .from(invitations)
    .where(eq(invitations.organization_id, organizationId))
    .orderBy(desc(invitations.created_at))
    .limit(50);
}

/** 審査待ちの参加申請 (申請中の学生の氏名・大学名を含む) */
export async function listPendingJoinRequests(ctx: DataContext, organizationId: string) {
  if (!(await isOrgAdmin(ctx.db, ctx.actor.id, organizationId))) return [];
  const rows = await ctx.db
    .select({ request: joinRequests, full_name: user.name, university_name: user.universityName })
    .from(joinRequests)
    .innerJoin(user, eq(user.id, joinRequests.student_id))
    .where(and(eq(joinRequests.organization_id, organizationId), eq(joinRequests.status, "PENDING")))
    .orderBy(asc(joinRequests.created_at));
  return rows.map((r) => ({ ...r.request, full_name: r.full_name, university_name: r.university_name ?? "—" }));
}

/** 組織 (組織コードのハッシュは返さない)。管理者・所属学生・申請中の学生のみ */
export async function getOrganization(ctx: DataContext, organizationId: string) {
  const org = await ctx.db
    .select({
      id: organizations.id,
      name: organizations.name,
      created_by: organizations.created_by,
      join_code_issued_at: organizations.join_code_issued_at,
      created_at: organizations.created_at,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, organizationId),
        or(
          sql`exists (select 1 from organization_members om where om.organization_id = ${organizations.id} and om.user_id = ${ctx.actor.id})`,
          sql`exists (select 1 from student_memberships sm where sm.organization_id = ${organizations.id} and sm.student_id = ${ctx.actor.id} and sm.status = 'ACTIVE')`,
          sql`exists (select 1 from join_requests jr where jr.organization_id = ${organizations.id} and jr.student_id = ${ctx.actor.id} and jr.status = 'PENDING')`,
        ),
      ),
    )
    .get();
  if (!org) throw apiError("NOT_FOUND", "組織が見つかりません。");
  return org;
}

/** 学生本人の所属状況 */
export async function getStudentMembership(ctx: DataContext, studentId: string) {
  if (studentId !== ctx.actor.id) throw apiError("FORBIDDEN");
  const [membership, pendingRequest] = await Promise.all([
    ctx.db
      .select()
      .from(studentMemberships)
      .where(and(eq(studentMemberships.student_id, studentId), eq(studentMemberships.status, "ACTIVE")))
      .get(),
    ctx.db
      .select()
      .from(joinRequests)
      .where(and(eq(joinRequests.student_id, studentId), eq(joinRequests.status, "PENDING")))
      .get(),
  ]);
  const orgId = membership?.organization_id ?? pendingRequest?.organization_id;
  const organization = orgId
    ? ((await ctx.db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)).get()) ?? null)
    : null;
  const admins = membership
    ? (await listOrgMembers(ctx, membership.organization_id)).map((m) => ({ full_name: m.full_name, role: m.role }))
    : [];
  return { membership: membership ?? null, organization, admins, pendingRequest: pendingRequest ?? null };
}

// =============================================================================
// 組織・組織コード
// =============================================================================

/** 組織作成 (作成者を OWNER とする) */
export async function createOrganization(ctx: DataContext, name: string) {
  if (ctx.actor.role !== "ADMIN") throw apiError("NOT_ADMIN_ACCOUNT", "組織を作成できるのは管理者アカウントのみです。");
  if (await getMyOrgMembership(ctx)) throw apiError("ALREADY_IN_ORGANIZATION");
  const id = crypto.randomUUID();
  try {
    await ctx.db.batch([
      ctx.db.insert(organizations).values({ id, name: name.trim(), created_by: ctx.actor.id }),
      ctx.db.insert(organizationMembers).values({ id: crypto.randomUUID(), organization_id: id, user_id: ctx.actor.id, role: "OWNER" }),
    ]);
  } catch (error) {
    // 同時に 2 つ作成しようとした場合は、管理者 1 人 1 組織の一意制約で失敗する
    if (fromDbError(error)?.code === "DUPLICATE") throw apiError("ALREADY_IN_ORGANIZATION");
    throw error;
  }
  return getOrganization(ctx, id);
}

/** 組織コードの発行・再発行 (旧コードは無効)。平文は発行時のみ返す */
export async function regenerateJoinCode(ctx: DataContext) {
  const member = await requireOrgMembership(ctx);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomJoinCode();
    try {
      await ctx.db
        .update(organizations)
        .set({ join_code_hash: await sha256Hex(code), join_code_issued_at: nowIso() })
        .where(eq(organizations.id, member.organization_id));
      return code;
    } catch (error) {
      if (fromDbError(error)?.code !== "DUPLICATE") throw error; // 他組織とコードが衝突したら作り直す
    }
  }
  throw new ApiError(500, "INTERNAL_ERROR", "組織コードを発行できませんでした。時間をおいて再度お試しください。");
}

export async function disableJoinCode(ctx: DataContext) {
  const member = await requireOrgMembership(ctx);
  await ctx.db.update(organizations).set({ join_code_hash: null, join_code_issued_at: null }).where(eq(organizations.id, member.organization_id));
}

// =============================================================================
// 招待リンク
// =============================================================================

/** 招待リンク作成 (有効期限 7 日, 1 回限り)。平文トークンは作成時のみ返し、DB にはハッシュのみ保存 */
export async function createInvitation(ctx: DataContext, input: { email: string | null; role: "STUDENT" | "ADMIN" }) {
  const member = await requireOrgMembership(ctx);
  const email = input.email?.trim().toLowerCase() || null;
  if (input.role === "ADMIN") {
    if (member.role !== "OWNER") throw apiError("FORBIDDEN", "管理者の招待は組織のオーナーのみ行えます。");
    if (!email) throw apiError("EMAIL_REQUIRED", "管理者の招待にはメールアドレスが必要です。");
  }
  const token = randomToken();
  const row = {
    id: crypto.randomUUID(),
    organization_id: member.organization_id,
    email,
    invitee_role: input.role,
    token_hash: await sha256Hex(token),
    created_by: ctx.actor.id,
    expires_at: addDays(nowIso(), INVITATION_TTL_DAYS),
  };
  await ctx.db.insert(invitations).values(row);
  return { invitation_id: row.id, token, expires_at: row.expires_at };
}

/** 招待の取り消し (未使用・未取り消しのみ。取り消しの解除は不可。管理者招待の取り消しはオーナーのみ) */
export async function revokeInvitation(ctx: DataContext, invitationId: string) {
  const inv = await ctx.db.select().from(invitations).where(eq(invitations.id, invitationId)).get();
  const member = await getMyOrgMembership(ctx);
  if (!inv || !member || member.organization_id !== inv.organization_id) throw apiError("NOT_FOUND", "招待が見つかりません。");
  if (inv.invitee_role === "ADMIN" && member.role !== "OWNER") throw apiError("FORBIDDEN", "管理者の招待はオーナーのみ取り消せます。");
  const rows = await ctx.db
    .update(invitations)
    .set({ revoked_at: nowIso() })
    .where(and(eq(invitations.id, inv.id), isNull(invitations.used_at), isNull(invitations.revoked_at)))
    .returning({ id: invitations.id });
  if (!rows.length) throw apiError("INVITATION_NOT_REVOCABLE");
}

export type InvitationState = "VALID" | "EXPIRED" | "USED" | "REVOKED" | "NOT_FOUND";

function invitationState(inv: { revoked_at: string | null; used_at: string | null; expires_at: string }, now = nowIso()): InvitationState {
  if (inv.revoked_at) return "REVOKED";
  if (inv.used_at) return "USED";
  if (inv.expires_at <= now) return "EXPIRED";
  return "VALID";
}

/** 招待情報の確認 (ログイン前でも組織名と状態を確認できる。メールアドレスは返さない) */
export async function getInvitation(db: DB, token: string) {
  const row = await db
    .select({ inv: invitations, organization_name: organizations.name })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organization_id))
    .where(eq(invitations.token_hash, await sha256Hex(token)))
    .get();
  if (!row) return { organization_name: null, invitee_role: null, email_restricted: null, expires_at: null, state: "NOT_FOUND" as InvitationState };
  return {
    organization_name: row.organization_name,
    invitee_role: row.inv.invitee_role,
    email_restricted: row.inv.email !== null,
    expires_at: row.inv.expires_at,
    state: invitationState(row.inv),
  };
}

function membershipAudit(ctx: DataContext, m: Pick<StudentMembershipRow, "id" | "student_id">, action: "INSERT" | "UPDATE", values: { old: object | null; new: object | null }) {
  return {
    actorId: ctx.actor.id,
    targetType: "student_memberships" as const,
    targetId: m.id,
    applicationId: null,
    studentId: m.student_id,
    action,
    oldValues: values.old as Record<string, unknown> | null,
    newValues: values.new as Record<string, unknown> | null,
  };
}

/** 招待の受諾。学生は共有同意 (consent_version) が必須 */
export async function acceptInvitation(ctx: DataContext, token: string, consentVersion: string | null) {
  const inv = await ctx.db.select().from(invitations).where(eq(invitations.token_hash, await sha256Hex(token))).get();
  if (!inv) throw apiError("INVITATION_NOT_FOUND");
  const state = invitationState(inv);
  if (state === "REVOKED") throw apiError("INVITATION_REVOKED");
  if (state === "USED") throw apiError("INVITATION_USED");
  if (state === "EXPIRED") throw apiError("INVITATION_EXPIRED");

  const me = await ctx.db.select({ email: user.email, emailVerified: user.emailVerified, role: user.role }).from(user).where(eq(user.id, ctx.actor.id)).get();
  if (!me) throw apiError("UNAUTHENTICATED");
  if (inv.email && (me.email.toLowerCase() !== inv.email || !me.emailVerified)) {
    throw apiError("INVITATION_EMAIL_MISMATCH", "招待先のメールアドレスと、ログイン中の認証済みメールアドレスが一致しません。");
  }

  const now = nowIso();
  // 1. 招待を使用済みにする (未使用・未取り消し・期限内のときだけ。同時に受諾された場合は片方だけ成功する)
  const claim = ctx.db
    .update(invitations)
    .set({ used_at: now, used_by: ctx.actor.id })
    .where(and(eq(invitations.id, inv.id), isNull(invitations.used_at), isNull(invitations.revoked_at), gt(invitations.expires_at, now)))
    .returning({ id: invitations.id });
  // 2. 以降の文は「この招待を自分が使用済みにできた」ときだけ実行する
  const claimed = sql`exists (select 1 from invitations i where i.id = ${inv.id} and i.used_by = ${ctx.actor.id} and i.used_at = ${now})`;
  const items: Batch = [claim];

  if (inv.invitee_role === "STUDENT") {
    if (me.role !== "STUDENT") throw apiError("NOT_STUDENT_ACCOUNT", "この招待は学生アカウント向けです。");
    if (!consentVersion?.trim()) throw apiError("CONSENT_REQUIRED");
    const active = await ctx.db
      .select({ id: studentMemberships.id })
      .from(studentMemberships)
      .where(and(eq(studentMemberships.student_id, ctx.actor.id), eq(studentMemberships.status, "ACTIVE")))
      .get();
    if (active) throw apiError("ALREADY_IN_ORGANIZATION", "すでに別の組織に所属しています。先に脱退してください。");
    const membership = {
      id: crypto.randomUUID(),
      student_id: ctx.actor.id,
      organization_id: inv.organization_id,
      status: "ACTIVE",
      consent_version: consentVersion.trim(),
      consented_at: now,
      joined_at: now,
    };
    items.push(insertWhere(ctx.db, "student_memberships", membership, claimed));
    items.push(auditIfChanged(ctx.db, membershipAudit(ctx, membership, "INSERT", { old: null, new: snapshot(membership) })));
    items.push(
      ctx.db
        .update(joinRequests)
        .set({ status: "CANCELLED" })
        .where(and(eq(joinRequests.student_id, ctx.actor.id), eq(joinRequests.status, "PENDING"), claimed)),
    );
  } else {
    if (me.role !== "ADMIN") throw apiError("NOT_ADMIN_ACCOUNT", "この招待は管理者アカウント向けです。");
    if (await getMyOrgMembership(ctx)) throw apiError("ALREADY_IN_ORGANIZATION");
    items.push(
      insertWhere(ctx.db, "organization_members", { id: crypto.randomUUID(), organization_id: inv.organization_id, user_id: ctx.actor.id, role: "ADMIN", joined_at: now }, claimed),
    );
  }

  let results: unknown[];
  try {
    results = await ctx.db.batch(items);
  } catch (error) {
    // 同時に別の組織へ所属した場合は「ACTIVE は 1 件」「管理者 1 人 1 組織」の一意制約で失敗する
    if (fromDbError(error)?.code === "DUPLICATE") throw apiError("ALREADY_IN_ORGANIZATION");
    throw error;
  }
  if (!(results[0] as unknown[]).length) {
    const latest = await ctx.db.select().from(invitations).where(eq(invitations.id, inv.id)).get();
    const s = latest ? invitationState(latest) : "NOT_FOUND";
    throw apiError(s === "REVOKED" ? "INVITATION_REVOKED" : s === "EXPIRED" ? "INVITATION_EXPIRED" : "INVITATION_USED");
  }
  return inv.organization_id;
}

// =============================================================================
// 組織コードによる参加申請 (承認されるまでデータは共有されない)
// =============================================================================

export async function requestJoin(ctx: DataContext, code: string, consentVersion: string) {
  if (ctx.actor.role !== "STUDENT") throw apiError("NOT_STUDENT_ACCOUNT", "組織コードで参加できるのは学生アカウントのみです。");
  if (!consentVersion.trim()) throw apiError("CONSENT_REQUIRED");

  // 総当たり対策: 直近 1 時間の失敗が上限に達したら拒否
  const now = nowIso();
  const failures = await ctx.db
    .select({ n: count() })
    .from(joinCodeFailures)
    .where(and(eq(joinCodeFailures.user_id, ctx.actor.id), gt(joinCodeFailures.attempted_at, new Date(Date.now() - 3_600_000).toISOString())))
    .get();
  if ((failures?.n ?? 0) >= JOIN_CODE_MAX_FAILURES) {
    throw apiError("RATE_LIMITED", "組織コードの入力に続けて失敗したため、しばらく時間をおいてから再度お試しください。");
  }

  const normalized = normalizeJoinCode(code);
  const org =
    normalized.length === 8
      ? await ctx.db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(eq(organizations.join_code_hash, await sha256Hex(normalized)))
          .get()
      : undefined;
  if (!org) {
    await ctx.db.batch([
      ctx.db.delete(joinCodeFailures).where(and(eq(joinCodeFailures.user_id, ctx.actor.id), lt(joinCodeFailures.attempted_at, addDays(now, -1)))),
      ctx.db.insert(joinCodeFailures).values({ user_id: ctx.actor.id, attempted_at: now }),
    ]);
    throw apiError("JOIN_CODE_INVALID");
  }
  const active = await ctx.db
    .select({ id: studentMemberships.id })
    .from(studentMemberships)
    .where(and(eq(studentMemberships.student_id, ctx.actor.id), eq(studentMemberships.status, "ACTIVE")))
    .get();
  if (active) throw apiError("ALREADY_IN_ORGANIZATION", "すでに組織に所属しています。先に脱退してください。");

  const id = crypto.randomUUID();
  try {
    await ctx.db.insert(joinRequests).values({
      id,
      student_id: ctx.actor.id,
      organization_id: org.id,
      status: "PENDING",
      consent_version: consentVersion.trim(),
      consented_at: now,
    });
  } catch (error) {
    // 審査中の申請は 1 件まで (部分一意インデックス)
    if (fromDbError(error)?.code === "DUPLICATE") throw apiError("JOIN_REQUEST_PENDING");
    throw error;
  }
  return { request_id: id, organization_name: org.name };
}

/** 学生による参加申請の取り下げ (= 同意の撤回) */
export async function cancelJoinRequest(ctx: DataContext, requestId: string) {
  const rows = await ctx.db
    .update(joinRequests)
    .set({ status: "CANCELLED", reviewed_at: nowIso(), reviewed_by: ctx.actor.id })
    .where(and(eq(joinRequests.id, requestId), eq(joinRequests.student_id, ctx.actor.id), eq(joinRequests.status, "PENDING")))
    .returning({ id: joinRequests.id });
  if (!rows.length) throw apiError("NOT_FOUND", "審査中の参加申請が見つかりません。");
}

/** 管理者による参加申請の承認・却下 */
export async function reviewJoinRequest(ctx: DataContext, requestId: string, approve: boolean) {
  const req = await ctx.db.select().from(joinRequests).where(eq(joinRequests.id, requestId)).get();
  if (!req || !(await isOrgAdmin(ctx.db, ctx.actor.id, req.organization_id))) throw apiError("NOT_FOUND", "参加申請が見つかりません。");
  if (req.status !== "PENDING") throw apiError("JOIN_REQUEST_NOT_PENDING");

  const now = nowIso();
  // 学生が取り下げていない (PENDING のまま) ことを条件に処理する
  const items: Batch = [
    ctx.db
      .update(joinRequests)
      .set({ status: approve ? "APPROVED" : "REJECTED", reviewed_at: now, reviewed_by: ctx.actor.id })
      .where(and(eq(joinRequests.id, req.id), eq(joinRequests.status, "PENDING")))
      .returning({ id: joinRequests.id }),
  ];
  if (approve) {
    const active = await ctx.db
      .select({ id: studentMemberships.id })
      .from(studentMemberships)
      .where(and(eq(studentMemberships.student_id, req.student_id), eq(studentMemberships.status, "ACTIVE")))
      .get();
    if (active) throw apiError("ALREADY_IN_ORGANIZATION", "この学生はすでに別の組織に所属しています。");
    const membership = {
      id: crypto.randomUUID(),
      student_id: req.student_id,
      organization_id: req.organization_id,
      status: "ACTIVE",
      consent_version: req.consent_version,
      consented_at: req.consented_at,
      joined_at: now,
    };
    const approved = sql`exists (select 1 from join_requests jr where jr.id = ${req.id} and jr.status = 'APPROVED' and jr.reviewed_at = ${now} and jr.reviewed_by = ${ctx.actor.id})`;
    items.push(insertWhere(ctx.db, "student_memberships", membership, approved));
    items.push(auditIfChanged(ctx.db, membershipAudit(ctx, membership, "INSERT", { old: null, new: snapshot(membership) })));
  }
  let results: unknown[];
  try {
    results = await ctx.db.batch(items);
  } catch (error) {
    if (fromDbError(error)?.code === "DUPLICATE") throw apiError("ALREADY_IN_ORGANIZATION", "この学生はすでに別の組織に所属しています。");
    throw error;
  }
  if (!(results[0] as unknown[]).length) throw apiError("JOIN_REQUEST_NOT_PENDING");
}

// =============================================================================
// 所属解除・管理者の削除
// =============================================================================

/** 所属解除 (学生本人 / 組織管理者)。応募データは学生側に残る */
export async function endMembership(ctx: DataContext, membershipId: string) {
  const m = await ctx.db.select().from(studentMemberships).where(eq(studentMemberships.id, membershipId)).get();
  if (!m || !(m.student_id === ctx.actor.id || (await isOrgAdmin(ctx.db, ctx.actor.id, m.organization_id)))) {
    throw apiError("NOT_FOUND", "所属情報が見つかりません。");
  }
  if (m.status !== "ACTIVE") throw apiError("MEMBERSHIP_NOT_ACTIVE");
  const now = nowIso();
  const [rows] = (await ctx.db.batch([
    ctx.db
      .update(studentMemberships)
      .set({ status: "ENDED", ended_at: now, ended_by: ctx.actor.id })
      .where(and(eq(studentMemberships.id, m.id), eq(studentMemberships.status, "ACTIVE")))
      .returning({ id: studentMemberships.id }),
    auditIfChanged(ctx.db, membershipAudit(ctx, m, "UPDATE", { old: { status: "ACTIVE", ended_at: null }, new: { status: "ENDED", ended_at: now } })),
  ])) as [unknown[], unknown];
  if (!rows.length) throw apiError("MEMBERSHIP_NOT_ACTIVE");
}

/** 管理者の削除 (オーナーのみ) / 自分の脱退。オーナーは削除できない */
export async function removeOrgMember(ctx: DataContext, memberId: string) {
  const rows = await ctx.db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.id, memberId),
        ne(organizationMembers.role, "OWNER"),
        or(
          eq(organizationMembers.user_id, ctx.actor.id),
          sql`exists (select 1 from organization_members o where o.organization_id = ${organizationMembers.organization_id} and o.user_id = ${ctx.actor.id} and o.role = 'OWNER')`,
        ),
      ),
    )
    .returning({ id: organizationMembers.id });
  if (!rows.length) throw apiError("FORBIDDEN", "この管理者を削除する権限がありません。");
}
