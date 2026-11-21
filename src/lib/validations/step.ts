import { z } from "zod";
import {
  expectedVersionSchema,
  optionalDateTime,
  optionalText,
  optionalUrl,
  requiredText,
  stepResultSchema,
  stepStatusSchema,
  stepTypeSchema,
  uuidSchema,
} from "./common";

const stepFields = {
  stepType: stepTypeSchema,
  displayName: requiredText(100, "表示名"),
  status: stepStatusSchema,
  result: stepResultSchema.nullable(),
  scheduledAt: optionalDateTime,
  deadlineAt: optionalDateTime,
  location: optionalText(200, "実施場所"),
  meetingUrl: optionalUrl("オンライン会議URL"),
  notes: optionalText(5000, "メモ"),
};

export const createStepSchema = z
  .object({
    ...stepFields,
    status: stepStatusSchema.optional(),
    result: stepResultSchema.nullable().optional(),
    displayName: requiredText(100, "表示名").optional(),
    /** 省略時は末尾に追加 */
    position: z.number().int().min(0).optional(),
  })
  .strict();
export type CreateStepInput = z.infer<typeof createStepSchema>;

export const updateStepSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    changes: z
      .object(stepFields)
      .partial()
      .strict()
      .refine((v) => Object.keys(v).length > 0, { error: "更新する項目がありません" }),
  })
  .strict();
export type UpdateStepInput = z.infer<typeof updateStepSchema>;

export const reorderStepsSchema = z.object({ stepIds: z.array(uuidSchema).min(1).max(100) }).strict();
