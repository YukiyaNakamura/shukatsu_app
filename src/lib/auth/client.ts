"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

/** ブラウザ用の Better Auth クライアント (同一オリジンの /api/auth を呼ぶ) */
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: "string", required: true },
        universityName: { type: "string", required: false },
      },
    }),
  ],
});
