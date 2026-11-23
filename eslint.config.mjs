import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Next.js / Cloudflare / OpenNext のビルド成果物 (iCloud 対策の *.nosync を含む)
    ".next.nosync/**",
    ".open-next/**",
    ".open-next.nosync/**",
    ".wrangler/**",
    ".wrangler.nosync/**",
    "cloudflare-env.d.ts",
  ]),
]);

export default eslintConfig;
