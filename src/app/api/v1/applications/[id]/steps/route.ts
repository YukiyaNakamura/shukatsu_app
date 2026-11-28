import { ok, parseBody, parseParam, withAuth } from "@/lib/api/handler";
import { uuidSchema } from "@/lib/validations/common";
import { createStepSchema } from "@/lib/validations/step";
import { getApplication, listSteps } from "@/lib/data/applications";
import { createStep, toStepInsert } from "@/lib/data/steps";

type Params = { id: string };

/** GET /api/v1/applications/:id/steps */
export const GET = withAuth<Params>(async ({ params, ctx }) => {
  const id = parseParam(uuidSchema, params.id);
  await getApplication(ctx, id);
  return ok(await listSteps(ctx, id));
});

/** POST /api/v1/applications/:id/steps — ステップ追加 (同種ステップの複数登録可) */
export const POST = withAuth<Params>(async ({ request, params, ctx }) => {
  const id = parseParam(uuidSchema, params.id);
  const input = await parseBody(request, createStepSchema);
  return ok(await createStep(ctx, id, toStepInsert(input)), 201);
});
