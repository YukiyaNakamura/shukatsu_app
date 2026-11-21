/** ブラウザから /api/v1 を呼び出すクライアント */

export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  get isConflict() {
    return this.status === 409 && this.code === "VERSION_CONFLICT";
  }
  get isNetwork() {
    return this.code === "NETWORK_ERROR";
  }
  get isUnauthenticated() {
    return this.status === 401;
  }
  /** 422 のフィールド別エラー */
  get fieldErrors(): Record<string, string> {
    const d = this.details as { fieldErrors?: Record<string, string> } | undefined;
    return d?.fieldErrors ?? {};
  }
}

type Options = { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown; signal?: AbortSignal };

export async function api<T>(path: string, { method = "GET", body, signal }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      signal,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ClientApiError(0, "NETWORK_ERROR", "ネットワークに接続できません。接続を確認して再試行してください。");
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // 本文なし
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    const fallback =
      res.status === 401
        ? "セッションの有効期限が切れました。再度ログインしてください。"
        : res.status >= 500
          ? "サーバーでエラーが発生しました。時間をおいて再度お試しください。"
          : "リクエストを処理できませんでした。";
    throw new ClientApiError(res.status, err?.code ?? "HTTP_" + res.status, err?.message ?? fallback, err?.details);
  }
  return (json as { data: T }).data;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ClientApiError) return error.message;
  return "予期しないエラーが発生しました。";
}
