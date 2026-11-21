import { ok, parseBody, parseParam, withAuth } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/validations/common";
import { reorderStepsSchema } from "@/lib/validations/step";
import { getApplication, listSteps } from "@/lib/data/applications";

/** PUT /api/v1/applications/:id/steps/order — ステップの並べ替え */
export const PUT = withAuth<{ id: string }>(async ({ request, params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  const { stepIds } = await parseBody(request, reorderStepsSchema);
  await getApplication(supabase, id);
  unwrap(await supabase.rpc("reorder_steps", { p_application_id: id, p_step_ids: stepIds }));
  return ok(await listSteps(supabase, id));
});
