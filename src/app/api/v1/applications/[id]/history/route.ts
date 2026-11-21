import { ok, parseParam, withAuth } from "@/lib/api/handler";
import { uuidSchema } from "@/lib/validations/common";
import { getApplicationHistory } from "@/lib/data/applications";

/** GET /api/v1/applications/:id/history — 変更履歴 */
export const GET = withAuth<{ id: string }>(async ({ params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  return ok(await getApplicationHistory(supabase, id));
});
