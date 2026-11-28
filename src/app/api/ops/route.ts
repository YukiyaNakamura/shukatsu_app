import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, ok, parseBody } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { listPendingDeletionRequests, processAccountDeletion, purgeOldAuditLogs } from "@/lib/data/account";
import { timingSafeEqualString } from "@/lib/server/crypto";
import { getDb, getEnv } from "@/lib/server/env";

/**
 * 運営者用 API (scripts/ops.mjs から呼ぶ)。Authorization: Bearer <OPERATOR_TOKEN> が必要。
 *   GET  /api/ops                                   … 処理待ちの退会申請の一覧
 *   POST /api/ops { action: "process-deletions" }   … 退会申請をすべて処理する
 *   POST /api/ops { action: "purge-audit-logs" }    … 保存期間 (1 年) を過ぎた監査ログを削除する
 * OPERATOR_TOKEN が未設定の環境では常に 404 を返す (API ごと無効)。
 */
async function authorize(request: NextRequest) {
  const expected = (await getEnv()).OPERATOR_TOKEN;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 32) throw new ApiError(404, "NOT_FOUND", "対象が見つかりません。");
  if (!timingSafeEqualString(given, expected)) throw new ApiError(401, "UNAUTHENTICATED", "運営者トークンが正しくありません。");
}

export async function GET(request: NextRequest) {
  try {
    await authorize(request);
    return ok(await listPendingDeletionRequests(await getDb()));
  } catch (error) {
    return errorResponse(error);
  }
}

const bodySchema = z.object({ action: z.enum(["process-deletions", "purge-audit-logs"]) }).strict();

export async function POST(request: NextRequest) {
  try {
    await authorize(request);
    const { action } = await parseBody(request, bodySchema);
    const db = await getDb();
    if (action === "purge-audit-logs") return ok({ deleted: await purgeOldAuditLogs(db) });
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const req of await listPendingDeletionRequests(db)) {
      try {
        await processAccountDeletion(db, req.id);
        results.push({ id: req.id, ok: true });
      } catch (error) {
        results.push({ id: req.id, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return NextResponse.json({ data: { processed: results } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
