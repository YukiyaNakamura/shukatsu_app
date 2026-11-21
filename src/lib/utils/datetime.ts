/**
 * 日時ユーティリティ。DB は timestamptz (UTC)、画面表示は日本時間 (Asia/Tokyo) を基本とする。
 */
export const APP_TIME_ZONE = "Asia/Tokyo";
const JST_OFFSET = "+09:00";

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});
const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});
const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFormatter.format(new Date(iso)) : "";
}
export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFormatter.format(new Date(iso)) : "";
}
export function formatTime(iso: string | null | undefined): string {
  return iso ? timeFormatter.format(new Date(iso)) : "";
}

/** 相対表記 (例: 3日前) */
export function formatRelative(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "—";
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}日前`;
  return formatDate(iso);
}

function jstParts(date: Date) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

/** ISO 文字列 → `<input type="datetime-local">` 用の JST 文字列 (YYYY-MM-DDTHH:mm) */
export function toJstInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = jstParts(new Date(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** `<input type="datetime-local">` の JST 文字列 → ISO 8601 (+09:00)。空なら null */
export function fromJstInputValue(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  return new Date(`${value}:00${JST_OFFSET}`).toISOString();
}

/** JST の日付キー (YYYY-MM-DD) */
export function jstDateKey(dateOrIso: Date | string): string {
  const p = jstParts(typeof dateOrIso === "string" ? new Date(dateOrIso) : dateOrIso);
  return `${p.year}-${p.month}-${p.day}`;
}

/** JST の年月の開始・終了 (UTC ISO)。month は 1-12 */
export function jstMonthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = new Date(`${year}-${pad(month)}-01T00:00:00${JST_OFFSET}`);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const to = new Date(`${nextYear}-${pad(nextMonth)}-01T00:00:00${JST_OFFSET}`);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** 現在の JST 年月 */
export function currentJstYearMonth(now = new Date()): { year: number; month: number } {
  const p = jstParts(now);
  return { year: Number(p.year), month: Number(p.month) };
}
