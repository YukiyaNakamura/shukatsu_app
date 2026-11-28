import { ok, withAuth } from "@/lib/api/handler";
import { listPendingJoinRequests } from "@/lib/data/organization";
import { requireOrgMembership } from "@/lib/server/access";

/** GET /api/v1/organizations/join-requests — 審査待ちの参加申請 */
export const GET = withAuth(async ({ ctx }) => {
  const member = await requireOrgMembership(ctx);
  return ok(await listPendingJoinRequests(ctx, member.organization_id));
});
