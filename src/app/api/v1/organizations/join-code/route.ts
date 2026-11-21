import { ok, withAuth } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/errors";

/** POST /api/v1/organizations/join-code — 組織コードの発行・再発行 (平文はこの応答のみ) */
export const POST = withAuth(async ({ supabase }) => {
  const code = unwrap(await supabase.rpc("regenerate_join_code"));
  return ok({ code: `${code.slice(0, 4)}-${code.slice(4)}` }, 201);
});

/** DELETE /api/v1/organizations/join-code — 組織コードの無効化 */
export const DELETE = withAuth(async ({ supabase }) => {
  unwrap(await supabase.rpc("disable_join_code"));
  return ok({ disabled: true });
});
