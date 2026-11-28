import { ok, withAuth } from "@/lib/api/handler";
import { disableJoinCode, regenerateJoinCode } from "@/lib/data/organization";

/** POST /api/v1/organizations/join-code — 組織コードの発行・再発行 (平文はこの応答のみ) */
export const POST = withAuth(async ({ ctx }) => {
  const code = await regenerateJoinCode(ctx);
  return ok({ code: `${code.slice(0, 4)}-${code.slice(4)}` }, 201);
});

/** DELETE /api/v1/organizations/join-code — 組織コードの無効化 */
export const DELETE = withAuth(async ({ ctx }) => {
  await disableJoinCode(ctx);
  return ok({ disabled: true });
});
