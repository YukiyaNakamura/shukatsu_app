#!/usr/bin/env node
/**
 * 運営者用スクリプト (退会処理・監査ログの削除)。
 *
 *   APP_URL=https://<your-app> OPERATOR_TOKEN=<token> node scripts/ops.mjs list
 *   APP_URL=https://<your-app> OPERATOR_TOKEN=<token> node scripts/ops.mjs process-deletions --execute
 *   APP_URL=https://<your-app> OPERATOR_TOKEN=<token> node scripts/ops.mjs purge-audit-logs --execute
 *
 * --execute を付けない場合は、処理対象の一覧を表示するだけで何も変更しない。
 */
const [command = "list", flag] = process.argv.slice(2);
const appUrl = process.env.APP_URL?.replace(/\/$/, "");
const token = process.env.OPERATOR_TOKEN;
if (!appUrl || !token) {
  console.error("APP_URL と OPERATOR_TOKEN を環境変数で指定してください。");
  process.exit(1);
}

async function call(method, body) {
  const res = await fetch(`${appUrl}/api/ops`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json", Origin: appUrl } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`失敗しました (${res.status}):`, json?.error?.message ?? json);
    process.exit(1);
  }
  return json.data;
}

if (!["list", "process-deletions", "purge-audit-logs"].includes(command)) {
  console.error(`不明なコマンドです: ${command}`);
  process.exit(1);
}

if (command === "purge-audit-logs") {
  if (flag !== "--execute") {
    console.log("保存期間 (1 年) を過ぎた監査ログを削除します。実行するには --execute を付けてください。");
  } else {
    console.log("削除した監査ログ:", (await call("POST", { action: "purge-audit-logs" })).deleted, "件");
  }
} else {
  const pending = await call("GET");
  console.log(`処理待ちの退会申請: ${pending.length} 件`);
  for (const r of pending) console.log(`  ${r.id}  ${r.email ?? "(削除済み)"}  ${r.requested_at}`);
  if (command === "process-deletions") {
    if (flag !== "--execute") {
      console.log("\n実行するには --execute を付けてください (アカウントと個人データは元に戻せません)。");
    } else if (pending.length) {
      const { processed } = await call("POST", { action: "process-deletions" });
      for (const r of processed) console.log(`  ${r.ok ? "完了" : "失敗"}  ${r.id}${r.error ? `  ${r.error}` : ""}`);
    }
  }
}
