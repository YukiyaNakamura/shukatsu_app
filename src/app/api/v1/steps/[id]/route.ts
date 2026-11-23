import { ok, parseBody, parseParam, withAuth } from "@/lib/api/handler";
import { uuidSchema } from "@/lib/validations/common";
import { updateStepSchema } from "@/lib/validations/step";
import { deleteStep, toStepColumns, updateStepWithVersion } from "@/lib/data/steps";

type Params = { id: string };

/** PATCH /api/v1/steps/:id — 楽観的ロック付き更新 */
export const PATCH = withAuth<Params>(async ({ request, params, ctx }) => {
  const id = parseParam(uuidSchema, params.id);
  const { expectedVersion, changes } = await parseBody(request, updateStepSchema);
  return ok(await updateStepWithVersion(ctx, id, expectedVersion, toStepColumns(changes)));
});

/** DELETE /api/v1/steps/:id — 現在段階だった場合は応募の現在段階が未設定になる */
export const DELETE = withAuth<Params>(async ({ params, ctx }) => {
  const id = parseParam(uuidSchema, params.id);
  return ok(await deleteStep(ctx, id));
});
