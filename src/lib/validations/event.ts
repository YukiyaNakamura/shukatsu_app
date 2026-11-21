import { z } from "zod";
import { isoDateTime, optionalDateTime, optionalText, requiredText, uuidSchema } from "./common";

const eventFields = z.object({
  title: requiredText(200, "タイトル"),
  startsAt: isoDateTime,
  endsAt: optionalDateTime,
  description: optionalText(5000, "メモ"),
  applicationId: uuidSchema.nullable().optional(),
});

const endAfterStart = (v: { startsAt?: string; endsAt?: string | null }) =>
  !v.startsAt || !v.endsAt || new Date(v.endsAt) >= new Date(v.startsAt);

export const createEventSchema = eventFields
  .extend({ studentId: uuidSchema.optional() })
  .strict()
  .refine(endAfterStart, { error: "終了日時は開始日時より後にしてください", path: ["endsAt"] });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = eventFields
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { error: "更新する項目がありません" })
  .refine(endAfterStart, { error: "終了日時は開始日時より後にしてください", path: ["endsAt"] });

export const calendarQuerySchema = z
  .object({
    from: isoDateTime,
    to: isoDateTime,
    studentId: uuidSchema.optional(),
  })
  .refine((v) => new Date(v.to) > new Date(v.from), { error: "期間が正しくありません" })
  .refine((v) => new Date(v.to).getTime() - new Date(v.from).getTime() <= 1000 * 60 * 60 * 24 * 100, {
    error: "期間は100日以内で指定してください",
  });
