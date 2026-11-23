/** 現在時刻 (ISO 8601, UTC, ミリ秒付き)。DB の日時列はすべてこの形式で保存する */
export function nowIso() {
  return new Date().toISOString();
}

/** タイムゾーン付きの日時文字列を、保存・比較用の UTC 形式に揃える */
export function toUtcIso(value: string): string;
export function toUtcIso(value: string | null): string | null;
export function toUtcIso(value: string | null | undefined): string | null | undefined;
export function toUtcIso(value: string | null | undefined) {
  if (value === null || value === undefined) return value;
  return new Date(value).toISOString();
}

export function addDays(iso: string, days: number) {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}
