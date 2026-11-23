import { ok, parseBody, withAuth } from "@/lib/api/handler";
import { joinRequestSchema } from "@/lib/validations/organization";
import { requestJoin } from "@/lib/data/organization";

/** POST /api/v1/join-requests — 組織コードで参加申請 (承認まではデータ共有されない) */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseBody(request, joinRequestSchema);
  const row = await requestJoin(ctx, input.code, input.consentVersion);
  return ok({ requestId: row.request_id, organizationName: row.organization_name }, 201);
});
