/** Supabase Auth のエラーを日本語に変換 */
export function authErrorMessage(error: { message?: string; code?: string; status?: number } | null | undefined): string {
  if (!error) return "";
  const code = error.code ?? "";
  const msg = error.message ?? "";
  if (code === "invalid_credentials" || /Invalid login credentials/i.test(msg)) return "メールアドレスまたはパスワードが正しくありません。";
  if (code === "email_not_confirmed" || /Email not confirmed/i.test(msg)) return "メールアドレスの確認が完了していません。届いた確認メールのリンクを開いてください。";
  if (code === "user_already_exists" || /already registered/i.test(msg)) return "このメールアドレスはすでに登録されています。ログインしてください。";
  if (code === "weak_password" || /Password should be/i.test(msg)) return "パスワードが弱すぎます。8文字以上で、推測されにくいものにしてください。";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || error.status === 429)
    return "短時間に操作が集中しました。しばらく待ってから再度お試しください。";
  if (code === "same_password") return "現在と同じパスワードは設定できません。";
  if (code === "otp_expired" || /expired/i.test(msg)) return "リンクの有効期限が切れています。もう一度やり直してください。";
  if (code === "session_not_found" || code === "refresh_token_not_found") return "セッションの有効期限が切れました。再度ログインしてください。";
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
