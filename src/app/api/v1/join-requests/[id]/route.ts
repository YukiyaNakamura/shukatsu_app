import { ok, parseBody, parseParam, withAuth } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/validations/common";
import { reviewJoinRequestSchema } from "@/lib/validations/organization";

/** PATCH /api/v1/join-requests/:id — { action: APPROVE | REJECT } (管理者) / { action: CANCEL } (学生本人) */
export const PATCH = withAuth<{ id: string }>(async ({ request, params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  const { action } = await parseBody(request, reviewJoinRequestSchema);
  if (action === "CANCEL") {
    unwrap(await supabase.rpc("cancel_join_request", { p_request_id: id }));
  } else {
    unwrap(await supabase.rpc("review_join_request", { p_request_id: id, p_approve: action === "APPROVE" }));
  }
  return ok({ id, action });
});
