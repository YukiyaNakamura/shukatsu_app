import { ok, withAuth } from "@/lib/api/handler";
import { listOrgMembers, listOrgStudents } from "@/lib/data/organization";
import { requireOrgMembership } from "../_context";

/** GET /api/v1/organizations/members — 管理者と所属学生 */
export const GET = withAuth(async ({ supabase, user }) => {
  const member = await requireOrgMembership(supabase, user.id);
  const [admins, students] = await Promise.all([listOrgMembers(supabase, member.organization_id), listOrgStudents(supabase)]);
  return ok({ admins, students });
});
