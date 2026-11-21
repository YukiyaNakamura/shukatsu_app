#!/usr/bin/env node
/**
 * 運営者用: 退会申請の処理と、保存期間 (1年) を過ぎた監査ログの削除。
 *
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/process-account-deletions.mjs            # 一覧のみ (dry-run)
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/process-account-deletions.mjs --execute  # 実行
 *
 * Secret (service_role) キーはこのスクリプトでのみ使用する。Web アプリや Cloudflare には設定しない。
 * 処理内容は public.process_account_deletion() を参照 (個人データ削除 / 監査ログの匿名化・削除 / 組織オーナーの移譲)。
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL と SUPABASE_SECRET_KEY を環境変数で指定してください。");
  process.exit(1);
}
const execute = process.argv.includes("--execute");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: requests, error } = await supabase
  .from("account_deletion_requests")
  .select("id, user_id, requested_at")
  .eq("status", "REQUESTED")
  .order("requested_at");
if (error) {
  console.error("退会申請の取得に失敗しました:", error.message);
  process.exit(1);
}

console.log(`未処理の退会申請: ${requests.length} 件${execute ? "" : " (dry-run: --execute で実行)"}`);
let failed = 0;
for (const r of requests) {
  console.log(`- ${r.id} (user ${r.user_id}, 申請 ${r.requested_at})`);
  if (!execute) continue;
  const { error: e } = await supabase.rpc("process_account_deletion", { p_request_id: r.id });
  if (e) {
    failed += 1;
    console.error(`  失敗: ${e.message}`);
  } else {
    console.log("  完了");
  }
}

if (execute) {
  const { data: purged, error: e } = await supabase.rpc("purge_old_audit_logs");
  if (e) console.error("監査ログの削除に失敗しました:", e.message);
  else console.log(`保存期間を過ぎた監査ログを ${purged} 件削除しました`);
}
process.exit(failed ? 1 : 0);
