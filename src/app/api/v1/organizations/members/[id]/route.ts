import { ok, parseParam, withAuth } from "@/lib/api/handler";
import { ApiError, unwrap } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/validations/common";

/** DELETE /api/v1/organizations/members/:id — 管理者の削除 (OWNER のみ) / 自分の脱退。OWNER は削除不可 (RLS) */
export const DELETE = withAuth<{ id: string }>(async ({ params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  const rows = unwrap(await supabase.from("organization_members").delete().eq("id", id).select("id"));
  if (!rows.length) throw new ApiError(403, "FORBIDDEN", "この管理者を削除する権限がありません。");
  return ok({ id });
});
