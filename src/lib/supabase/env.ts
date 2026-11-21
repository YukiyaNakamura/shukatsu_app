/**
 * Supabase の公開設定。NEXT_PUBLIC_* はビルド時にクライアントへ埋め込まれるため、
 * 公開して問題ない URL と publishable (anon) キーのみを置く。
 * Service Role / Secret キーはアプリ本体では一切使用しない。
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase の環境変数が未設定です。.env.local に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY を設定してください。",
    );
  }
  return { url, key };
}
