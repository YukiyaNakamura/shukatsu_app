import { ok, parseBody, withAuth } from "@/lib/api/handler";
import { ApiError, unwrap } from "@/lib/api/errors";
import { joinRequestSchema } from "@/lib/validations/organization";

/** POST /api/v1/join-requests — 組織コードで参加申請 (承認まではデータ共有されない) */
export const POST = withAuth(async ({ request, supabase }) => {
  const input = await parseBody(request, joinRequestSchema);
  const rows = unwrap(await supabase.rpc("request_join", { p_code: input.code, p_consent_version: input.consentVersion }));
  // コード不一致時、DB 関数は失敗回数を記録するため例外ではなく 0 行を返す
  if (!rows?.length) throw new ApiError(404, "JOIN_CODE_INVALID", "組織コードが正しくありません。");
  return ok({ requestId: rows[0].request_id, organizationName: rows[0].organization_name }, 201);
});
