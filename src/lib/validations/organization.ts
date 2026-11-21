import { z } from "zod";
import { CONSENT_VERSION } from "@/lib/constants";
import { emailSchema } from "./profile";
import { requiredText } from "./common";

export const createOrganizationSchema = z.object({ name: requiredText(100, "組織名") }).strict();

export const createInvitationSchema = z
  .object({
    email: z
      .union([emailSchema, z.literal("")])
      .optional()
      .transform((v) => (v ? v.toLowerCase() : null)),
    role: z.enum(["STUDENT", "ADMIN"]).optional().default("STUDENT"),
  })
  .strict()
  .refine((v) => v.role === "STUDENT" || v.email, { error: "管理者を招待するにはメールアドレスが必要です", path: ["email"] });

const consentSchema = z.literal(CONSENT_VERSION, { error: "選考情報の共有に同意してください" });

export const acceptInvitationSchema = z
  .object({
    token: z.string().regex(/^[0-9a-f]{64}$/, { error: "招待リンクが正しくありません" }),
    consentVersion: consentSchema.optional(),
  })
  .strict();

export const joinRequestSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((v) => v.replace(/[^A-Za-z0-9]/g, "").toUpperCase())
      .pipe(z.string().length(8, { error: "組織コードは8文字です" })),
    consentVersion: consentSchema,
  })
  .strict();

export const reviewJoinRequestSchema = z
  .object({ action: z.enum(["APPROVE", "REJECT", "CANCEL"], { error: "操作が正しくありません" }) })
  .strict();
