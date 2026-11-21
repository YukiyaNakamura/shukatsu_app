/** API エラーの定義と、PostgreSQL / PostgREST エラーからの変換 */

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

/** DB 関数が投げるエラーコード → HTTP ステータス・既定メッセージ */
const DB_ERROR_MAP: Record<string, [number, string]> = {
  UNAUTHENTICATED: [401, "ログインが必要です。"],
  FORBIDDEN: [403, "この操作を行う権限がありません。"],
  FORBIDDEN_FIELD: [403, "この項目は変更できません。"],
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
  JOIN_CODE_INVALID: [404, "組織コードが正しくありません。"],
  JOIN_REQUEST_PENDING: [409, "審査中の参加申請があります。"],
  JOIN_REQUEST_NOT_PENDING: [409, "この参加申請はすでに処理済み、または取り下げられています。"],
  MEMBERSHIP_NOT_ACTIVE: [409, "この所属はすでに解除されています。"],
  INVALID_STEP_ORDER: [409, "ステップの並び順が最新ではありません。再読み込みしてください。"],
  DELETION_ALREADY_REQUESTED: [409, "すでに退会申請済みです。"],
  INVITATION_NOT_REVOCABLE: [409, "この招待はすでに使用済み、または取り消し済みです。"],
  RATE_LIMITED: [429, "操作が続けて失敗しました。しばらく時間をおいてから再度お試しください。"],
};

type PgError = { code?: string; message?: string; details?: string | null; hint?: string | null };

export function fromDbError(error: PgError): ApiError {
  const message = error.message ?? "";
  const mapped = DB_ERROR_MAP[message];
  if (mapped) {
    return new ApiError(mapped[0], message, error.details || mapped[1]);
  }
  switch (error.code) {
    case "42501":
      return new ApiError(403, "FORBIDDEN", "この操作を行う権限がありません。");
    case "PGRST116":
      return new ApiError(404, "NOT_FOUND", "対象が見つかりません。");
    case "23505":
      return new ApiError(409, "DUPLICATE", "すでに登録されています。");
    case "23503":
      return new ApiError(422, "INVALID_REFERENCE", "関連するデータが見つかりません。");
    case "23514":
    case "22001":
      return new ApiError(422, "VALIDATION_FAILED", "入力内容が正しくありません。");
    case "22P02":
    case "22007":
    case "22008":
      return new ApiError(400, "BAD_REQUEST", "入力形式が正しくありません。");
    case "PGRST301":
    case "PGRST302":
      return new ApiError(401, "UNAUTHENTICATED", "セッションの有効期限が切れました。再度ログインしてください。");
  }
  console.error("Unhandled database error", { code: error.code, message: error.message });
  return new ApiError(500, "INTERNAL_ERROR", "サーバーでエラーが発生しました。時間をおいて再度お試しください。");
}

/** supabase-js の結果を検査し、エラーなら ApiError を投げる */
export function unwrap<R extends { data: unknown; error: PgError | null }>(result: R): Extract<R, { error: null }>["data"] {
  if (result.error) throw fromDbError(result.error);
  return result.data as Extract<R, { error: null }>["data"];
}
