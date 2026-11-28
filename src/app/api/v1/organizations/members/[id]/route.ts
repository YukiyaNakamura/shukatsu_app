import { ok, parseParam, withAuth } from "@/lib/api/handler";
import { uuidSchema } from "@/lib/validations/common";
import { removeOrgMember } from "@/lib/data/organization";

/** DELETE /api/v1/organizations/members/:id — 管理者の削除 (OWNER のみ) / 自分の脱退。OWNER は削除不可 */
export const DELETE = withAuth<{ id: string }>(async ({ params, ctx }) => {
  const id = parseParam(uuidSchema, params.id);
  await removeOrgMember(ctx, id);
  return ok({ id });
});
