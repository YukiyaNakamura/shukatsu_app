import { describe, expect, it } from "vitest";
import { ApiError, apiError, fromDbError } from "@/lib/api/errors";

/** drizzle は D1 のエラーを "Failed query: ..." で包み、元のエラーを cause に入れる */
const d1Error = (message: string) => new Error("Failed query: update ...", { cause: new Error(`D1_ERROR: ${message}: SQLITE_CONSTRAINT`) });

describe("D1 の制約エラー → HTTP ステータス", () => {
  it.each([
    ["UNIQUE constraint failed: organization_members.user_id", 409, "DUPLICATE"],
    ["FOREIGN KEY constraint failed", 422, "INVALID_REFERENCE"],
    ["CHECK constraint failed: applications_priority_range", 422, "VALIDATION_FAILED"],
    ["NOT NULL constraint failed: applications.company_name", 422, "VALIDATION_FAILED"],
  ])("%s → %i", (message, status, code) => {
    const e = fromDbError(d1Error(message));
    expect(e?.status).toBe(status);
    expect(e?.code).toBe(code);
  });

  it("制約違反でないエラーは null (呼び出し側で 500 として扱う)", () => {
    expect(fromDbError(new Error("network down"))).toBeNull();
  });
});

describe("業務エラー", () => {
  it.each([
    ["VERSION_CONFLICT", 409],
    ["INVITATION_EXPIRED", 410],
    ["ALREADY_IN_ORGANIZATION", 409],
    ["JOIN_CODE_INVALID", 404],
    ["RATE_LIMITED", 429],
    ["APPLICATION_DELETED", 410],
  ] as const)("%s → %i", (code, status) => {
    const e = apiError(code);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(status);
    expect(e.message).not.toBe("");
  });

  it("メッセージと詳細を上書きできる", () => {
    const e = apiError("INVITATION_EMAIL_MISMATCH", "一致しません", { a: 1 });
    expect(e.message).toBe("一致しません");
    expect(e.details).toEqual({ a: 1 });
  });
});
