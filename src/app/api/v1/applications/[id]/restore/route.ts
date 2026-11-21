import { ok, parseParam, withAuth } from "@/lib/api/handler";
import { uuidSchema } from "@/lib/validations/common";
import { getApplicationOverview, setApplicationDeleted } from "@/lib/data/applications";

/** POST /api/v1/applications/:id/restore — 論理削除からの復元 */
export const POST = withAuth<{ id: string }>(async ({ params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  await setApplicationDeleted(supabase, id, false);
  return ok(await getApplicationOverview(supabase, id));
});
