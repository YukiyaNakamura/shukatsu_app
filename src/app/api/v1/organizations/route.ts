import { ok, parseBody, withAuth } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/errors";
import { createOrganizationSchema } from "@/lib/validations/organization";
import { getOrganization } from "@/lib/data/organization";

/** POST /api/v1/organizations — 組織作成 (作成者が OWNER) */
export const POST = withAuth(async ({ request, supabase }) => {
  const { name } = await parseBody(request, createOrganizationSchema);
  const id = unwrap(await supabase.rpc("create_organization", { p_name: name }));
  return ok(await getOrganization(supabase, id), 201);
});
