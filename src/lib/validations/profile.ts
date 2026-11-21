import { z } from "zod";
import { requiredText } from "./common";

export const fullNameSchema = requiredText(100, "氏名");
export const universityNameSchema = requiredText(100, "大学名");

export const updateProfileSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    universityName: universityNameSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { error: "更新する項目がありません" });

export const passwordSchema = z
  .string()
  .min(8, { error: "パスワードは8文字以上で入力してください" })
  .max(72, { error: "パスワードは72文字以内で入力してください" });

export const emailSchema = z.email({ error: "メールアドレスの形式が正しくありません" }).max(320);

export const signUpSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("STUDENT"),
    fullName: fullNameSchema,
    universityName: universityNameSchema,
    email: emailSchema,
    password: passwordSchema,
  }),
  z.object({
    role: z.literal("ADMIN"),
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
  }),
]);
export type SignUpInput = z.infer<typeof signUpSchema>;
