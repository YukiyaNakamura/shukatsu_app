import { and, eq } from "drizzle-orm";
import { ok, parseBody, withAuth } from "@/lib/api/handler";
import { organizationMembers, studentMemberships } from "@/db/schema";
import { apiError } from "@/lib/api/errors";
import { getProfile, updateProfile } from "@/lib/data/account";
import { updateProfileSchema } from "@/lib/validations/profile";

/** GET /api/v1/me — ログインユーザーのプロフィールと所属 */
export const GET = withAuth(async ({ ctx, user }) => {
  const profile = await getProfile(ctx.db, user.id);
  if (!profile) throw apiError("NOT_FOUND", "プロフィールが見つかりません。");
  const [orgMember, studentMembership] = await Promise.all([
    ctx.db
      .select({ id: organizationMembers.id, organization_id: organizationMembers.organization_id, role: organizationMembers.role })
      .from(organizationMembers)
      .where(eq(organizationMembers.user_id, user.id))
      .get(),
    ctx.db
      .select({ id: studentMemberships.id, organization_id: studentMemberships.organization_id, joined_at: studentMemberships.joined_at })
      .from(studentMemberships)
      .where(and(eq(studentMemberships.student_id, user.id), eq(studentMemberships.status, "ACTIVE")))
      .get(),
  ]);
  return ok({
    id: user.id,
    email: user.email,
    role: profile.role,
    fullName: profile.full_name,
    universityName: profile.university_name,
    organizationMember: orgMember ?? null,
    studentMembership: studentMembership ?? null,
  });
});

/** PATCH /api/v1/me — 氏名・大学名の更新 (ロール等は変更不可) */
export const PATCH = withAuth(async ({ request, ctx }) => {
  const input = await parseBody(request, updateProfileSchema);
  const profile = await updateProfile(ctx, input);
  return ok({ fullName: profile.full_name, universityName: profile.university_name });
});
