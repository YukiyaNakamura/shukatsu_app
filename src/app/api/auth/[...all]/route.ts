import type { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/server";

/** Better Auth のエンドポイント (サインアップ・ログイン・メール確認・パスワード再設定など) */
async function handle(request: NextRequest) {
  return (await getAuth()).handler(request);
}

export { handle as GET, handle as POST };
