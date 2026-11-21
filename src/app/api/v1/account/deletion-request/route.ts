import { ok, withAuth } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/errors";

/** POST /api/v1/account/deletion-request — 退会申請 (運営者が処理するまで取り消し可能) */
export const POST = withAuth(async ({ supabase }) => {
  const id = unwrap(await supabase.rpc("request_account_deletion"));
  return ok({ id, status: "REQUESTED" }, 201);
});

/** DELETE /api/v1/account/deletion-request — 退会申請の取り消し */
export const DELETE = withAuth(async ({ supabase }) => {
  unwrap(await supabase.rpc("cancel_account_deletion"));
  return ok({ status: "CANCELLED" });
});
