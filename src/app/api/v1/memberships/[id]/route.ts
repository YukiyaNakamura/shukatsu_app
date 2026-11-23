import { ok, parseParam, withAuth } from "@/lib/api/handler";
import { uuidSchema } from "@/lib/validations/common";
import { endMembership } from "@/lib/data/organization";

/** DELETE /api/v1/memberships/:id — 所属解除 (学生本人 / 組織管理者)。応募データは削除しない */
export const DELETE = withAuth<{ id: string }>(async ({ params, ctx }) => {
  const id = parseParam(uuidSchema, params.id);
  await endMembership(ctx, id);
  return ok({ id });
});
