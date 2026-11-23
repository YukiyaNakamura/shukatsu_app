/** API エラーの定義と、D1 (SQLite) の制約エラーからの変換 */

export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** 業務エラーコード → HTTP ステータス・既定メッセージ */
const ERROR_MAP = {
  UNAUTHENTICATED: [401, "ログインが必要です。"],
  FORBIDDEN: [403, "この操作を行う権限がありません。"],
  NOT_FOUND: [404, "対象が見つかりません。"],
  VERSION_CONFLICT: [409, "他のユーザーがこの応募を更新しました。最新の内容を確認してください。"],
  NOT_ADMIN_ACCOUNT: [403, "管理者アカウントではありません。"],
  NOT_STUDENT_ACCOUNT: [403, "学生アカウントではありません。"],
  NOT_ORG_ADMIN: [403, "組織の管理者ではありません。"],
  ALREADY_IN_ORGANIZATION: [409, "すでに組織に所属しています。"],
  EMAIL_REQUIRED: [422, "メールアドレスが必要です。"],
  CONSENT_REQUIRED: [422, "選考情報の共有への同意が必要です。"],
  INVITATION_NOT_FOUND: [404, "招待リンクが無効です。"],
  INVITATION_REVOKED: [410, "この招待リンクは取り消されています。"],
  INVITATION_USED: [410, "この招待リンクはすでに使用されています。"],
  INVITATION_EXPIRED: [410, "この招待リンクは有効期限が切れています。"],
  INVITATION_EMAIL_MISMATCH: [403, "招待先のメールアドレスと、ログイン中のメールアドレスが一致しません。"],
  INVITATION_NOT_REVOCABLE: [409, "この招待はすでに使用済み、または取り消し済みです。"],
  JOIN_CODE_INVALID: [404, "組織コードが正しくありません。"],
  JOIN_REQUEST_PENDING: [409, "審査中の参加申請があります。"],
  JOIN_REQUEST_NOT_PENDING: [409, "この参加申請はすでに処理済み、または取り下げられています。"],
  MEMBERSHIP_NOT_ACTIVE: [409, "この所属はすでに解除されています。"],
  INVALID_STEP_ORDER: [409, "ステップの並び順が最新ではありません。再読み込みしてください。"],
  APPLICATION_DELETED: [410, "この応募は削除されています。"],
  DELETION_ALREADY_REQUESTED: [409, "すでに退会申請済みです。"],
  RATE_LIMITED: [429, "操作が続けて失敗しました。しばらく時間をおいてから再度お試しください。"],
} as const satisfies Record<string, readonly [number, string]>;

export type ErrorCode = keyof typeof ERROR_MAP;

/** 業務エラーを作る。message を省略すると既定のメッセージ */
export function apiError(code: ErrorCode, message?: string, details?: unknown) {
  const [status, fallback] = ERROR_MAP[code];
  return new ApiError(status, code, message ?? fallback, details);
}

/** drizzle は D1 のエラーを "Failed query: ..." で包むため、原因のメッセージまでたどる */
function causeMessage(error: unknown): string {
  let e: unknown = error;
  const parts: string[] = [];
  for (let i = 0; i < 5 && e; i++) {
    if (e instanceof Error) {
      parts.push(e.message);
      e = e.cause;
    } else {
      parts.push(String(e));
      break;
    }
  }
  return parts.join(" | ");
}

/** D1 (SQLite) の制約違反を API エラーに変換する。該当しなければ null */
export function fromDbError(error: unknown): ApiError | null {
  const message = causeMessage(error);
  if (/UNIQUE constraint failed/i.test(message)) return new ApiError(409, "DUPLICATE", "すでに登録されています。");
  if (/FOREIGN KEY constraint failed/i.test(message)) {
    return new ApiError(422, "INVALID_REFERENCE", "関連するデータが見つかりません。");
  }
  if (/CHECK constraint failed|NOT NULL constraint failed/i.test(message)) {
    return new ApiError(422, "VALIDATION_FAILED", "入力内容が正しくありません。");
  }
  return null;
}
