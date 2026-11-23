import "server-only";
import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { DB } from "@/db";
import { accountDeletionRequests, auditLogs, organizationMembers, organizations, user } from "@/db/schema";
import { apiError, fromDbError } from "@/lib/api/errors";
import type { DataContext } from "@/lib/server/context";
import { nowIso } from "@/lib/server/time";
import type { ProfileRow } from "@/types/database";

type Batch = [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];

// =============================================================================
// プロフィール (Better Auth の user テーブル)
// =============================================================================

const profileFields = {
  id: user.id,
  role: user.role,
  full_name: user.name,
  university_name: user.universityName,
  created_at: user.createdAt,
  updated_at: user.updatedAt,
};

export async function getProfile(db: DB, userId: string): Promise<ProfileRow | null> {
  const row = await db.select(profileFields).from(user).where(eq(user.id, userId)).get();
  return row ? { ...row, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString() } : null;
}

/** 氏名・大学名の更新 (ロール・メールアドレスはここでは変更できない) */
export async function updateProfile(ctx: DataContext, input: { fullName?: string; universityName?: string }) {
  const patch: { name?: string; universityName?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (input.fullName !== undefined) patch.name = input.fullName.trim();
  if (input.universityName !== undefined) patch.universityName = input.universityName.trim();
  const rows = await ctx.db.update(user).set(patch).where(eq(user.id, ctx.actor.id)).returning({ id: user.id });
  if (!rows.length) throw apiError("NOT_FOUND", "プロフィールが見つかりません。");
  return (await getProfile(ctx.db, ctx.actor.id))!;
}

// =============================================================================
// 退会申請
// =============================================================================

export async function getOpenDeletionRequest(ctx: DataContext) {
  return (
    (await ctx.db
      .select({ status: accountDeletionRequests.status, requested_at: accountDeletionRequests.requested_at })
      .from(accountDeletionRequests)
      .where(and(eq(accountDeletionRequests.user_id, ctx.actor.id), inArray(accountDeletionRequests.status, ["REQUESTED", "PROCESSING"])))
      .get()) ?? null
  );
}

export async function requestAccountDeletion(ctx: DataContext) {
  const id = crypto.randomUUID();
  try {
    await ctx.db.insert(accountDeletionRequests).values({ id, user_id: ctx.actor.id, status: "REQUESTED" });
  } catch (error) {
    // 処理前の申請は 1 件まで (部分一意インデックス)
    if (fromDbError(error)?.code === "DUPLICATE") throw apiError("DELETION_ALREADY_REQUESTED");
    throw error;
  }
  return id;
}

export async function cancelAccountDeletion(ctx: DataContext) {
  const rows = await ctx.db
    .update(accountDeletionRequests)
    .set({ status: "CANCELLED", processed_at: nowIso() })
    .where(and(eq(accountDeletionRequests.user_id, ctx.actor.id), eq(accountDeletionRequests.status, "REQUESTED")))
    .returning({ id: accountDeletionRequests.id });
  if (!rows.length) throw apiError("NOT_FOUND", "取り消せる退会申請がありません。");
}

// =============================================================================
// 運営者用 (OPERATOR_TOKEN で保護された /api/ops からのみ呼ぶ)
// =============================================================================

export async function listPendingDeletionRequests(db: DB) {
  return db
    .select({ id: accountDeletionRequests.id, user_id: accountDeletionRequests.user_id, requested_at: accountDeletionRequests.requested_at, email: user.email })
    .from(accountDeletionRequests)
    .leftJoin(user, eq(user.id, accountDeletionRequests.user_id))
    .where(eq(accountDeletionRequests.status, "REQUESTED"))
    .orderBy(asc(accountDeletionRequests.requested_at));
}

/**
 * 退会処理 (1 つの batch = トランザクションで実行)
 *   * 所有組織: 他の管理者がいれば最も古い管理者へ OWNER を移譲、いなければ組織を削除
 *   * user を削除 → セッション・応募・ステップ・予定・所属などの個人データは ON DELETE CASCADE で削除
 *   * その学生のデータに関する監査ログを削除。他人のデータへの操作ログは actor_id を NULL 化 (匿名化)
 *   * 申請記録は COMPLETED として残し、user_id は NULL になる
 */
export async function processAccountDeletion(db: DB, requestId: string) {
  const req = await db.select().from(accountDeletionRequests).where(eq(accountDeletionRequests.id, requestId)).get();
  if (!req) throw apiError("NOT_FOUND");
  if (req.status !== "REQUESTED" || !req.user_id) throw apiError("NOT_FOUND", "処理対象の状態ではありません。");
  const uid = req.user_id;

  const owned = await db
    .select({ organization_id: organizationMembers.organization_id })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.user_id, uid), eq(organizationMembers.role, "OWNER")));

  // 1. 申請を「処理中」にする。読み込みの後に本人が取り消していた場合は 0 行になり、以降の文はすべて実行されない
  // 2. 以降の文は「この申請が処理中であること」を条件にする (同じ batch = トランザクション内で判定)
  const processing = sql`exists (select 1 from account_deletion_requests r where r.id = ${req.id} and r.status = 'PROCESSING')`;
  const items: BatchItem<"sqlite">[] = [
    db
      .update(accountDeletionRequests)
      .set({ status: "PROCESSING" })
      .where(and(eq(accountDeletionRequests.id, req.id), eq(accountDeletionRequests.status, "REQUESTED")))
      .returning({ id: accountDeletionRequests.id }),
  ];
  for (const { organization_id: orgId } of owned) {
    items.push(
      db.delete(organizationMembers).where(and(eq(organizationMembers.organization_id, orgId), eq(organizationMembers.user_id, uid), processing)),
      // 残っている管理者のうち最も古い人をオーナーにする (後任の選定も同じトランザクション内で行う)
      db
        .update(organizationMembers)
        .set({ role: "OWNER" })
        .where(
          and(
            processing,
            sql`${organizationMembers.id} = (select om.id from organization_members om where om.organization_id = ${orgId} order by om.joined_at, om.id limit 1)`,
          ),
        ),
      // 管理者が残っていなければ組織を削除する
      db
        .delete(organizations)
        .where(and(eq(organizations.id, orgId), processing, sql`not exists (select 1 from organization_members om where om.organization_id = ${orgId})`)),
    );
  }
  items.push(
    // 応募 ID はパラメーターで列挙せずサブクエリにする (D1 の 1 文あたりのパラメーター上限 100 を超えないように)
    db
      .delete(auditLogs)
      .where(
        and(
          processing,
          or(eq(auditLogs.student_id, uid), sql`${auditLogs.application_id} in (select a.id from applications a where a.student_id = ${uid})`),
        ),
      ),
    db.delete(user).where(and(eq(user.id, uid), processing)),
    db
      .update(accountDeletionRequests)
      .set({ status: "COMPLETED", processed_at: nowIso(), user_id: null })
      .where(and(eq(accountDeletionRequests.id, req.id), eq(accountDeletionRequests.status, "PROCESSING"))),
  );
  const [claimed] = (await db.batch(items as Batch)) as [unknown[], ...unknown[]];
  if (!claimed.length) throw apiError("NOT_FOUND", "処理対象の状態ではありません (取り消された可能性があります)。");
}

/** 監査ログの保存期間 (1 年) を過ぎたものを削除する */
export async function purgeOldAuditLogs(db: DB) {
  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const rows = await db.delete(auditLogs).where(lt(auditLogs.created_at, cutoff)).returning({ id: auditLogs.id });
  return rows.length;
}
