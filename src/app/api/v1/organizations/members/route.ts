import { ok, withAuth } from "@/lib/api/handler";
import { listOrgMembers, listOrgStudents } from "@/lib/data/organization";
import { requireOrgMembership } from "@/lib/server/access";

/** GET /api/v1/organizations/members — 管理者と所属学生 */
export const GET = withAuth(async ({ ctx }) => {
  const member = await requireOrgMembership(ctx);
  const [admins, students] = await Promise.all([listOrgMembers(ctx, member.organization_id), listOrgStudents(ctx)]);
  return ok({ admins, students });
});
