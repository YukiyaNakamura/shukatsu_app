import { describe, expect, it } from "vitest";
import { fromJstInputValue, jstDateKey, jstMonthRange, toJstInputValue } from "@/lib/utils/datetime";
import { safeNextPath } from "@/lib/auth/auth-errors";
import { applicationStatusLabel } from "@/lib/constants";

describe("日時 (日本時間)", () => {
  it("datetime-local の JST 入力値と UTC ISO を相互変換する", () => {
    expect(fromJstInputValue("2026-12-01T10:30")).toBe("2026-12-01T01:30:00.000Z");
    expect(toJstInputValue("2026-12-01T01:30:00.000Z")).toBe("2026-12-01T10:30");
    expect(fromJstInputValue("")).toBeNull();
  });

  it("日付キーは JST 基準 (UTC 15:00 以降は翌日)", () => {
    expect(jstDateKey("2026-11-30T15:00:00Z")).toBe("2026-12-01");
    expect(jstDateKey("2026-11-30T14:59:59Z")).toBe("2026-11-30");
  });

  it("月の範囲は JST の月初〜翌月初", () => {
    expect(jstMonthRange(2026, 12)).toEqual({ from: "2026-11-30T15:00:00.000Z", to: "2026-12-31T15:00:00.000Z" });
  });
});

describe("ラベル", () => {
  it("ACCEPTED はインターンで「参加決定」、本選考で「内定」", () => {
    expect(applicationStatusLabel("ACCEPTED", "INTERNSHIP")).toBe("参加決定");
    expect(applicationStatusLabel("ACCEPTED", "FULL_TIME")).toBe("内定");
  });
});

describe("オープンリダイレクト対策", () => {
  it("アプリ内の相対パスのみ許可する", () => {
    expect(safeNextPath("/invite/abc")).toBe("/invite/abc");
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    // URL パーサーはタブ・改行を除去するため "/\t/evil" は "//evil" と同じになる
    expect(safeNextPath("/\t/evil.example")).toBeNull();
    expect(safeNextPath("/\n/evil.example")).toBeNull();
    expect(safeNextPath("/%09/evil.example")).toBe("/%09/evil.example");
    expect(safeNextPath("/student/applications?x=1#a")).toBe("/student/applications?x=1#a");
  });
});
