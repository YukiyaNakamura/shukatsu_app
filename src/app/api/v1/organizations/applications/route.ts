import { ok, parseQuery, withAuth } from "@/lib/api/handler";
import { listApplications } from "@/lib/data/applications";
import { requireOrgMembership } from "@/lib/server/access";
import { listApplicationsQuerySchema } from "@/lib/validations/application";

/** GET /api/v1/organizations/applications — 所属学生全員の応募 (自組織に ACTIVE 所属の学生のみ) */
export const GET = withAuth(async ({ request, ctx }) => {
  await requireOrgMembership(ctx);
  return ok(await listApplications(ctx, parseQuery(request, listApplicationsQuerySchema)));
});
