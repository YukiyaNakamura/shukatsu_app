import { ok, parseBody, withAuth } from "@/lib/api/handler";
import { ApiError, unwrap } from "@/lib/api/errors";
import { updateProfileSchema } from "@/lib/validations/profile";

/** GET /api/v1/me — ログインユーザーのプロフィールと所属 */
export const GET = withAuth(async ({ supabase, user }) => {
  const profile = unwrap(await supabase.from("profiles").select("*").eq("id", user.id).single());
  const [orgMember, studentMembership] = await Promise.all([
    supabase.from("organization_members").select("id, organization_id, role").eq("user_id", user.id).maybeSingle(),
    supabase.from("student_memberships").select("id, organization_id, joined_at").eq("student_id", user.id).eq("status", "ACTIVE").maybeSingle(),
  ]);
  return ok({
    id: user.id,
    email: user.email,
    role: profile.role,
    fullName: profile.full_name,
    universityName: profile.university_name,
    organizationMember: unwrap(orgMember),
    studentMembership: unwrap(studentMembership),
  });
});

/** PATCH /api/v1/me — 氏名・大学名の更新 (ロール等は変更不可) */
export const PATCH = withAuth(async ({ request, supabase, user }) => {
  const input = await parseBody(request, updateProfileSchema);
  const patch: { full_name?: string; university_name?: string } = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.universityName !== undefined) patch.university_name = input.universityName;
  const profile = unwrap(await supabase.from("profiles").update(patch).eq("id", user.id).select("*").maybeSingle());
  if (!profile) throw new ApiError(404, "NOT_FOUND", "プロフィールが見つかりません。");
  return ok({ fullName: profile.full_name, universityName: profile.university_name });
});
