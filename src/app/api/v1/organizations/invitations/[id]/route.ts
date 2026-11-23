import { ok, parseParam, withAuth } from "@/lib/api/handler";
import { uuidSchema } from "@/lib/validations/common";
import { revokeInvitation } from "@/lib/data/organization";

/** DELETE /api/v1/organizations/invitations/:id — 招待の取り消し (取り消しの解除は不可) */
export const DELETE = withAuth<{ id: string }>(async ({ params, ctx }) => {
  const id = parseParam(uuidSchema, params.id);
  await revokeInvitation(ctx, id);
  return ok({ id });
});
