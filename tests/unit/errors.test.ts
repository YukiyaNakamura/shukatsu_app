import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fromDbError, unwrap, ApiError } from "@/lib/api/errors";

describe("DB エラー → HTTP ステータス", () => {
  it.each([
    [{ code: "P0001", message: "VERSION_CONFLICT" }, 409],
    [{ code: "P0001", message: "INVITATION_EXPIRED" }, 410],
    [{ code: "P0001", message: "ALREADY_IN_ORGANIZATION" }, 409],
    [{ code: "P0001", message: "JOIN_CODE_INVALID" }, 404],
    [{ code: "42501", message: "new row violates row-level security policy" }, 403],
    [{ code: "PGRST116", message: "no rows" }, 404],
    [{ code: "23514", message: "check violation" }, 422],
    [{ code: "22P02", message: "invalid input syntax" }, 400],
    [{ code: "XX000", message: "boom" }, 500],
  ])("%o → %i", (err, status) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(fromDbError(err).status).toBe(status);
  });

  it("DB 関数の detail (日本語) をメッセージに使う", () => {
    const e = fromDbError({ code: "P0001", message: "INVITATION_EMAIL_MISMATCH", details: "一致しません" });
    expect(e.message).toBe("一致しません");
    expect(e.code).toBe("INVITATION_EMAIL_MISMATCH");
  });

  it("unwrap はエラー時に ApiError を投げる", () => {
    expect(() => unwrap({ data: null, error: { code: "42501", message: "x" } })).toThrow(ApiError);
    expect(unwrap({ data: 1, error: null })).toBe(1);
  });
});
