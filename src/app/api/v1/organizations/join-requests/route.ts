import { ok, withAuth } from "@/lib/api/handler";
import { listPendingJoinRequests } from "@/lib/data/organization";
import { requireOrgMembership } from "../_context";

/** GET /api/v1/organizations/join-requests — 審査待ちの参加申請 */
export const GET = withAuth(async ({ supabase, user }) => {
  const member = await requireOrgMembership(supabase, user.id);
  return ok(await listPendingJoinRequests(supabase, member.organization_id));
});
