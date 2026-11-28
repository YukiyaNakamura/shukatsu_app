import { ok, withAuth } from "@/lib/api/handler";
import { cancelAccountDeletion, requestAccountDeletion } from "@/lib/data/account";

/** POST /api/v1/account/deletion-request — 退会申請 (運営者が処理するまで取り消し可能) */
export const POST = withAuth(async ({ ctx }) => {
  const id = await requestAccountDeletion(ctx);
  return ok({ id, status: "REQUESTED" }, 201);
});

/** DELETE /api/v1/account/deletion-request — 退会申請の取り消し */
export const DELETE = withAuth(async ({ ctx }) => {
  await cancelAccountDeletion(ctx);
  return ok({ status: "CANCELLED" });
});
