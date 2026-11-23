import { ok, parseBody, parseParam, withAuth } from "@/lib/api/handler";
import { uuidSchema } from "@/lib/validations/common";
import { reorderStepsSchema } from "@/lib/validations/step";
import { reorderSteps } from "@/lib/data/applications";

/** PUT /api/v1/applications/:id/steps/order — ステップの並べ替え */
export const PUT = withAuth<{ id: string }>(async ({ request, params, ctx }) => {
  const id = parseParam(uuidSchema, params.id);
  const { stepIds } = await parseBody(request, reorderStepsSchema);
  return ok(await reorderSteps(ctx, id, stepIds));
});
