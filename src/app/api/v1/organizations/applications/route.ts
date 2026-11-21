import { ok, parseQuery, withAuth } from "@/lib/api/handler";
import { listApplications } from "@/lib/data/applications";
import { listApplicationsQuerySchema } from "@/lib/validations/application";
import { requireOrgMembership } from "../_context";

/** GET /api/v1/organizations/applications — 所属学生全員の応募 (RLS で自組織 ACTIVE 学生のみ) */
export const GET = withAuth(async ({ request, supabase, user }) => {
  await requireOrgMembership(supabase, user.id);
  return ok(await listApplications(supabase, parseQuery(request, listApplicationsQuerySchema)));
});
