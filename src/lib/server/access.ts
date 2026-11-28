import "server-only";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { organizationMembers, studentMemberships, user } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import type { DataContext } from "./context";

/**
 * アクセス制御 (Supabase の RLS ポリシーを置き換える)。
 *
 *   学生本人      … 自分のデータ
 *   組織の管理者  … 自組織に ACTIVE 所属している学生のデータのみ
 *
 * 所属が ENDED になった時点で、管理者は次のクエリからアクセスできなくなる (キャッシュしない)。
 * 学生データを読み書きするクエリは、必ず canAccessStudentSql を WHERE 句に含めること。
 */

/** 「actor が学生 studentCol のデータにアクセスできる」を表す SQL 条件 */
export function canAccessStudentSql(actorId: string, studentCol: SQLiteColumn | SQL): SQL {
  return sql`(${studentCol} = ${actorId} or ${studentCol} in (
    select sm.student_id from student_memberships sm
    join organization_members om on om.organization_id = sm.organization_id
    where sm.status = 'ACTIVE' and om.user_id = ${actorId}
  ))`;
}

/** 「actor が組織 orgCol の管理者である」 */
export function isOrgAdminSql(actorId: string, orgCol: SQLiteColumn | SQL): SQL {
  return sql`exists (select 1 from organization_members om where om.organization_id = ${orgCol} and om.user_id = ${actorId})`;
}

export async function canAccessStudent(ctx: DataContext, studentId: string) {
  if (studentId === ctx.actor.id) return true;
  const row = await ctx.db
    .select({ id: studentMemberships.id })
    .from(studentMemberships)
    .innerJoin(organizationMembers, eq(organizationMembers.organization_id, studentMemberships.organization_id))
    .where(
      and(
        eq(studentMemberships.student_id, studentId),
        eq(studentMemberships.status, "ACTIVE"),
        eq(organizationMembers.user_id, ctx.actor.id),
      ),
    )
    .get();
  return Boolean(row);
}

/** 学生データへの書き込み前の確認。対象が存在しない場合と区別できないよう 403 で拒否する */
export async function assertCanAccessStudent(ctx: DataContext, studentId: string) {
  if (!(await canAccessStudent(ctx, studentId))) {
    throw new ApiError(403, "FORBIDDEN", "この操作を行う権限がありません。");
  }
}

/** 学生アカウントであること (応募・予定の所有者になれるのは学生のみ) */
export async function assertStudentAccount(ctx: DataContext, studentId: string) {
  const row = await ctx.db.select({ role: user.role }).from(user).where(eq(user.id, studentId)).get();
  if (row?.role !== "STUDENT") throw new ApiError(403, "NOT_STUDENT_ACCOUNT", "学生アカウントではありません。");
}

/** ログイン中の管理者の所属 (管理者 1 人につき 1 組織) */
export async function getMyOrgMembership(ctx: DataContext) {
  return (
    (await ctx.db
      .select({ id: organizationMembers.id, organization_id: organizationMembers.organization_id, role: organizationMembers.role })
      .from(organizationMembers)
      .where(eq(organizationMembers.user_id, ctx.actor.id))
      .get()) ?? null
  );
}

/** 組織の管理者であること。無ければ 403 */
export async function requireOrgMembership(ctx: DataContext) {
  const member = await getMyOrgMembership(ctx);
  if (!member) throw new ApiError(403, "NOT_ORG_ADMIN", "組織の管理者ではありません。");
  return member;
}

/** 学生本人が ACTIVE 所属している組織 */
export async function getActiveStudentOrgId(ctx: DataContext, studentId: string) {
  const row = await ctx.db
    .select({ organization_id: studentMemberships.organization_id })
    .from(studentMemberships)
    .where(and(eq(studentMemberships.student_id, studentId), eq(studentMemberships.status, "ACTIVE")))
    .get();
  return row?.organization_id ?? null;
}
