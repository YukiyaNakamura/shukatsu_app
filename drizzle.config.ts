import { defineConfig } from "drizzle-kit";

/** `npm run db:generate` で src/db/schema.ts からマイグレーション SQL を生成する (適用は wrangler d1 migrations apply) */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
});
