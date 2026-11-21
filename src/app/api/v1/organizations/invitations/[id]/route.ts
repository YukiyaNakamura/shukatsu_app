import { ok, parseParam, withAuth } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/validations/common";

/** DELETE /api/v1/organizations/invitations/:id — 招待の取り消し (取り消しの解除は不可) */
export const DELETE = withAuth<{ id: string }>(async ({ params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  unwrap(await supabase.rpc("revoke_invitation", { p_invitation_id: id }));
  return ok({ id });
});
