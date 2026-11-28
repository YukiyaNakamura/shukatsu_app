import { ok, parseBody, withAuth } from "@/lib/api/handler";
import { createOrganizationSchema } from "@/lib/validations/organization";
import { createOrganization } from "@/lib/data/organization";

/** POST /api/v1/organizations — 組織作成 (作成者が OWNER) */
export const POST = withAuth(async ({ request, ctx }) => {
  const { name } = await parseBody(request, createOrganizationSchema);
  return ok(await createOrganization(ctx, name), 201);
});
