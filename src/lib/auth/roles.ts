import type { ProfileRow } from "@/types/database";

export type AccountRole = ProfileRow["role"];

/** 画面に表示するアカウントの種類 */
export const ROLE_LABELS: Record<AccountRole, string> = { STUDENT: "学生", ADMIN: "管理者" };

/** URL の ?role= を読む (不正な値は null) */
export function parseRole(value: unknown): AccountRole | null {
  return value === "STUDENT" || value === "ADMIN" ? value : null;
}
