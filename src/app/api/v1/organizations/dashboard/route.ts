import { ok, withAuth } from "@/lib/api/handler";
import { getOrgDashboard } from "@/lib/data/organization";
import { requireOrgMembership } from "../_context";

/** GET /api/v1/organizations/dashboard */
export const GET = withAuth(async ({ supabase, user }) => {
  await requireOrgMembership(supabase, user.id);
  return ok(await getOrgDashboard(supabase));
});
