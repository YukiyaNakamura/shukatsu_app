/** Better Auth のエラーを日本語に変換 */
export function authErrorMessage(error: { message?: string; code?: string; status?: number } | null | undefined): string {
  if (!error) return "";
  const code = error.code ?? "";
  const msg = error.message ?? "";
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_EMAIL":
      return "メールアドレスまたはパスワードが正しくありません。";
    case "EMAIL_NOT_VERIFIED":
      return "メールアドレスの確認が完了していません。確認メールを送信しましたので、メール内のリンクを開いてください。";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "このメールアドレスはすでに登録されています。ログインしてください。";
    case "PASSWORD_TOO_SHORT":
      return "パスワードは8文字以上で入力してください。";
    case "PASSWORD_TOO_LONG":
      return "パスワードは72文字以内で入力してください。";
    case "INVALID_PASSWORD":
      return "現在のパスワードが正しくありません。";
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return "リンクが無効か、有効期限が切れています。もう一度やり直してください。";
    case "INVALID_SIGN_UP":
      return msg || "入力内容を確認してください。";
    case "SESSION_EXPIRED":
      return "セッションの有効期限が切れました。再度ログインしてください。";
  }
  if (error.status === 429) return "短時間に操作が集中しました。しばらく待ってから再度お試しください。";
  if (error.status === 401) return "セッションの有効期限が切れました。再度ログインしてください。";
  if (/fetch|network/i.test(msg)) return "ネットワークに接続できません。接続を確認してください。";
  return "認証処理でエラーが発生しました。時間をおいて再度お試しください。";
}

const BASE = "https://app.invalid";

/**
 * オープンリダイレクト対策: アプリ内のパスのみ許可する。
 * 制御文字 (URL パーサーがタブ・改行を除去する) やバックスラッシュを拒否したうえで、
 * 実際に URL として解決し、同一オリジンに留まることを確認する。
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.length > 2048) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return null;
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/** メール確認後に戻るログイン画面の URL (確認完了の表示と、元のページへの遷移先を含む) */
export function verifiedCallbackPath(next: string | null) {
  return `/login?verified=1${next ? `&next=${encodeURIComponent(next)}` : ""}`;
}
