import { ok, parseBody, parseParam, withAuth } from "@/lib/api/handler";
import { uuidSchema } from "@/lib/validations/common";
import { reviewJoinRequestSchema } from "@/lib/validations/organization";
import { cancelJoinRequest, reviewJoinRequest } from "@/lib/data/organization";

/** PATCH /api/v1/join-requests/:id — { action: APPROVE | REJECT } (管理者) / { action: CANCEL } (学生本人) */
export const PATCH = withAuth<{ id: string }>(async ({ request, params, ctx }) => {
  const id = parseParam(uuidSchema, params.id);
  const { action } = await parseBody(request, reviewJoinRequestSchema);
  if (action === "CANCEL") await cancelJoinRequest(ctx, id);
  else await reviewJoinRequest(ctx, id, action === "APPROVE");
  return ok({ id, action });
});
