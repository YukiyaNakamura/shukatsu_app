#!/usr/bin/env node
/**
 * OpenNext のビルド成果物の補正 (opennextjs-cloudflare build の直後に実行する)。
 *
 * 問題: @opennextjs/aws の edge コンバーターは `import cookieParser from "cookie"` と既定インポートしているが、
 *       cookie@1 は __esModule 付きの CommonJS で default を持たない。proxy (ミドルウェア) のバンドルでは
 *       default が undefined になり、Cookie 付きのリクエスト (= ログイン後のすべてのページ) が
 *       "Cannot read properties of undefined (reading 'parse')" で 500 になる。
 * 対応: 既定インポートが無い場合は名前空間 (parse を直接持つ) を使うように置き換える。
 *
 * OpenNext 側で修正されて該当箇所が無くなった場合は何もしない。想定外の形の場合はビルドを失敗させる。
 */
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../.open-next/middleware/handler.mjs", import.meta.url);
const BROKEN = /\b(import_cookie\d*)\.default\.parse\(/g;
const FIXED = /\(import_cookie\d*\.default\|\|import_cookie\d*\)\.parse\(/;

let source;
try {
  source = readFileSync(file, "utf8");
} catch {
  console.error("patch-open-next: .open-next/middleware/handler.mjs がありません。先に opennextjs-cloudflare build を実行してください。");
  process.exit(1);
}

const matches = source.match(BROKEN)?.length ?? 0;
if (matches === 0) {
  console.log(FIXED.test(source) ? "patch-open-next: 補正済みです。" : "patch-open-next: 補正は不要です (OpenNext 側で修正済み)。");
  process.exit(0);
}
writeFileSync(file, source.replace(BROKEN, (_, name) => `(${name}.default||${name}).parse(`));
console.log(`patch-open-next: cookie の既定インポートを ${matches} 箇所補正しました。`);
