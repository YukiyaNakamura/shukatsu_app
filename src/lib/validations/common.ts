import { z } from "zod";
import { APPLICATION_STATUSES, SELECTION_TYPES, STEP_RESULTS, STEP_STATUSES, STEP_TYPES } from "@/lib/constants";

export const uuidSchema = z.uuid({ error: "IDの形式が正しくありません" });

/** 空文字は null として扱う任意テキスト */
export const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label}は${max}文字以内で入力してください` })
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const requiredText = (max: number, label: string) =>
  z
    .string({ error: `${label}を入力してください` })
    .trim()
    .min(1, { error: `${label}を入力してください` })
    .max(max, { error: `${label}は${max}文字以内で入力してください` });

export const optionalUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(2048, { error: `${label}が長すぎます` })
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), { error: `${label}は http:// または https:// で始まるURLを入力してください` })
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const isoDateTime = z.iso.datetime({ offset: true, error: "日時の形式が正しくありません" });
export const optionalDateTime = isoDateTime.nullable().optional();

export const selectionTypeSchema = z.enum(SELECTION_TYPES, { error: "選考区分を選択してください" });
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES, { error: "応募状況を選択してください" });
export const stepTypeSchema = z.enum(STEP_TYPES, { error: "選考段階を選択してください" });
export const stepStatusSchema = z.enum(STEP_STATUSES);
export const stepResultSchema = z.enum(STEP_RESULTS);
export const expectedVersionSchema = z.number({ error: "expectedVersion が必要です" }).int().positive();
