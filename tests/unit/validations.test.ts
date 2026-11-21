import { describe, expect, it } from "vitest";
import { createApplicationSchema, updateApplicationSchema, setCurrentStepSchema } from "@/lib/validations/application";
import { createStepSchema, updateStepSchema } from "@/lib/validations/step";
import { createEventSchema, calendarQuerySchema } from "@/lib/validations/event";
import { joinRequestSchema, createInvitationSchema, acceptInvitationSchema } from "@/lib/validations/organization";
import { signUpSchema, updateProfileSchema } from "@/lib/validations/profile";
import { CONSENT_VERSION } from "@/lib/constants";

describe("応募のバリデーション", () => {
  it("企業名と選考区分が必須", () => {
    expect(createApplicationSchema.safeParse({ companyName: "  ", selectionType: "FULL_TIME" }).success).toBe(false);
    expect(createApplicationSchema.safeParse({ companyName: "A社" }).success).toBe(false);
    const ok = createApplicationSchema.parse({ companyName: " A社 ", selectionType: "INTERNSHIP" });
    expect(ok.companyName).toBe("A社");
    expect(ok.useTemplate).toBe(true);
  });

  it("未知のフィールド (student_id の上書きなど) を拒否する", () => {
    expect(createApplicationSchema.safeParse({ companyName: "A", selectionType: "FULL_TIME", student_id: "x" }).success).toBe(false);
    expect(
      updateApplicationSchema.safeParse({ expectedVersion: 1, changes: { version: 99 } }).success,
    ).toBe(false);
  });

  it("更新には expectedVersion が必須で、空の変更は拒否", () => {
    expect(updateApplicationSchema.safeParse({ changes: { status: "IN_PROGRESS" } }).success).toBe(false);
    expect(updateApplicationSchema.safeParse({ expectedVersion: 1, changes: {} }).success).toBe(false);
    expect(updateApplicationSchema.safeParse({ expectedVersion: 1, changes: { status: "IN_PROGRESS" } }).success).toBe(true);
  });

  it("企業URLは http(s) のみ、空文字は null", () => {
    expect(updateApplicationSchema.safeParse({ expectedVersion: 1, changes: { companyUrl: "javascript:alert(1)" } }).success).toBe(false);
    const r = updateApplicationSchema.parse({ expectedVersion: 1, changes: { companyUrl: "" } });
    expect(r.changes.companyUrl).toBeNull();
  });

  it("現在段階は stepId か stepType のどちらか", () => {
    expect(setCurrentStepSchema.safeParse({ expectedVersion: 2, stepType: "FINAL_INTERVIEW" }).success).toBe(true);
    expect(setCurrentStepSchema.safeParse({ expectedVersion: 2, stepType: "UNKNOWN" }).success).toBe(false);
  });
});

describe("選考ステップ・予定のバリデーション", () => {
  it("日時はタイムゾーン付き ISO 8601", () => {
    expect(createStepSchema.safeParse({ stepType: "FIRST_INTERVIEW", scheduledAt: "2026-12-01T10:00:00+09:00" }).success).toBe(true);
    expect(createStepSchema.safeParse({ stepType: "FIRST_INTERVIEW", scheduledAt: "2026-12-01 10:00" }).success).toBe(false);
    expect(updateStepSchema.safeParse({ expectedVersion: 1, changes: { result: null } }).success).toBe(true);
  });

  it("予定の終了は開始以降", () => {
    expect(
      createEventSchema.safeParse({ title: "説明会", startsAt: "2026-12-01T10:00:00Z", endsAt: "2026-12-01T09:00:00Z" }).success,
    ).toBe(false);
  });

  it("カレンダー期間は 100 日以内", () => {
    expect(calendarQuerySchema.safeParse({ from: "2026-01-01T00:00:00Z", to: "2026-12-31T00:00:00Z" }).success).toBe(false);
    expect(calendarQuerySchema.safeParse({ from: "2026-12-01T00:00:00Z", to: "2027-01-01T00:00:00Z" }).success).toBe(true);
  });
});

describe("組織・プロフィールのバリデーション", () => {
  it("組織コードはハイフン・小文字を許容して正規化", () => {
    expect(joinRequestSchema.parse({ code: "abcd-efgh", consentVersion: CONSENT_VERSION }).code).toBe("ABCDEFGH");
    expect(joinRequestSchema.safeParse({ code: "ABC", consentVersion: CONSENT_VERSION }).success).toBe(false);
  });

  it("共有同意のバージョンが一致しない場合は拒否", () => {
    expect(joinRequestSchema.safeParse({ code: "ABCDEFGH", consentVersion: "old" }).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({ token: "not-a-token" }).success).toBe(false);
  });

  it("管理者招待はメールアドレス必須", () => {
    expect(createInvitationSchema.safeParse({ role: "ADMIN" }).success).toBe(false);
    expect(createInvitationSchema.parse({ email: "Foo@Example.com" }).email).toBe("foo@example.com");
  });

  it("学生登録は氏名・大学名・メールが必須、管理者は大学名不要", () => {
    expect(signUpSchema.safeParse({ role: "STUDENT", fullName: "山田", email: "a@b.jp", password: "password1" }).success).toBe(false);
    expect(signUpSchema.safeParse({ role: "ADMIN", fullName: "山田", email: "a@b.jp", password: "password1" }).success).toBe(true);
    expect(signUpSchema.safeParse({ role: "STUDENT", fullName: "山田", universityName: "東京大学", email: "a@b.jp", password: "short" }).success).toBe(false);
  });

  it("プロフィール更新でロールは変更できない", () => {
    expect(updateProfileSchema.safeParse({ role: "ADMIN" }).success).toBe(false);
  });
});
