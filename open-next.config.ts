import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// 全ページが認証依存の動的レンダリングのため、ISR 用のインクリメンタルキャッシュ (R2) は使用しない
export default defineCloudflareConfig({});
