import "server-only";
import type { AppEnv } from "./env";

export type Mail = { to: string; subject: string; text: string; html: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** リンク付きの定型メール */
export function linkMail(opts: { to: string; subject: string; lead: string; linkLabel: string; url: string; note: string }): Mail {
  const text = `${opts.lead}\n\n${opts.url}\n\n${opts.note}\n\n-- 選考管理アプリ`;
  const html = `<!doctype html><html><body style="font-family:sans-serif;line-height:1.7;color:#111">
<p>${escapeHtml(opts.lead)}</p>
<p><a href="${escapeHtml(opts.url)}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(opts.linkLabel)}</a></p>
<p style="font-size:12px;color:#555">ボタンが開けない場合は、次の URL をブラウザに貼り付けてください。<br>${escapeHtml(opts.url)}</p>
<p style="font-size:12px;color:#555">${escapeHtml(opts.note)}</p>
<p style="font-size:12px;color:#555">-- 選考管理アプリ</p>
</body></html>`;
  return { to: opts.to, subject: opts.subject, text, html };
}

/**
 * メール送信 (Resend の HTTP API)。
 * RESEND_API_KEY が未設定の場合は送信せず、内容をサーバーのログに出力する (ローカル開発用)。
 */
export async function sendMail(env: AppEnv, mail: Mail) {
  if (!env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY が未設定のため、メールを送信できません。");
    }
    console.info(`\n[mail] ${mail.subject} → ${mail.to}\n${mail.text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) {
    throw new Error(`メールの送信に失敗しました (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
}
