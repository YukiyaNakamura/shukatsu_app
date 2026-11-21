import { z } from "zod";
import {
  applicationStatusSchema,
  expectedVersionSchema,
  optionalText,
  optionalUrl,
  requiredText,
  selectionTypeSchema,
  stepTypeSchema,
  uuidSchema,
} from "./common";

export const companyNameSchema = requiredText(200, "企業名");

export const createApplicationSchema = z
  .object({
    /** 管理者が代理登録する場合に指定。省略時はログインユーザー本人 */
    studentId: uuidSchema.optional(),
    companyName: companyNameSchema,
    selectionType: selectionTypeSchema,
    isEarlySelection: z.boolean().optional().default(false),
    jobTitle: optionalText(200, "職種・コース"),
    status: applicationStatusSchema.optional(),
    useTemplate: z.boolean().optional().default(true),
  })
  .strict();
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const applicationFieldsSchema = z
  .object({
    companyName: companyNameSchema,
    selectionType: selectionTypeSchema,
    isEarlySelection: z.boolean(),
    jobTitle: optionalText(200, "職種・コース"),
    appliedAt: z.iso.date({ error: "応募日の形式が正しくありません" }).nullable(),
    companyUrl: optionalUrl("企業URL"),
    priority: z.number().int().min(1).max(5).nullable(),
    applicationSource: optionalText(100, "応募経路"),
    status: applicationStatusSchema,
    memo: optionalText(10000, "共有メモ"),
  })
  .partial()
  .strict();
export type ApplicationFieldsInput = z.infer<typeof applicationFieldsSchema>;

export const updateApplicationSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    changes: applicationFieldsSchema.refine((v) => Object.keys(v).length > 0, { error: "更新する項目がありません" }),
  })
  .strict();
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

export const setCurrentStepSchema = z.union([
  z.object({ expectedVersion: expectedVersionSchema, stepId: uuidSchema.nullable() }).strict(),
  z.object({ expectedVersion: expectedVersionSchema, stepType: stepTypeSchema }).strict(),
]);
export type SetCurrentStepInput = z.infer<typeof setCurrentStepSchema>;

export const listApplicationsQuerySchema = z.object({
  studentId: uuidSchema.optional(),
  q: z.string().trim().max(200).optional(),
  jobTitle: z.string().trim().max(200).optional(),
  selectionType: selectionTypeSchema.optional(),
  stepType: stepTypeSchema.optional(),
  status: applicationStatusSchema.optional(),
  includeDeleted: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
