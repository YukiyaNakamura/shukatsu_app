import { ok, parseParam, withAuth } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/validations/common";

/** DELETE /api/v1/memberships/:id — 所属解除 (学生本人 / 組織管理者)。応募データは削除しない */
export const DELETE = withAuth<{ id: string }>(async ({ params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  unwrap(await supabase.rpc("end_membership", { p_membership_id: id }));
  return ok({ id });
});
