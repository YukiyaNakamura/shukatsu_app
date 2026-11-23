import { ok, withAuth } from "@/lib/api/handler";
import { getOrgDashboard } from "@/lib/data/organization";
import { requireOrgMembership } from "@/lib/server/access";

/** GET /api/v1/organizations/dashboard */
export const GET = withAuth(async ({ ctx }) => {
  await requireOrgMembership(ctx);
  return ok(await getOrgDashboard(ctx));
});
