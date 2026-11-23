/**
 * 暗号関連のユーティリティ。Workers と Node.js の両方にある Web Crypto API だけを使う。
 */

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function toBase64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export async function sha256Hex(value: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

/** 256 bit の暗号学的乱数 (16 進 64 文字)。招待リンクのトークンに使う */
export function randomToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** 紛らわしい文字 (0/O/1/I) を除いた 32 文字種 */
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 8 文字の組織コード (256 は 32 で割り切れるため偏りなし。40 bit) */
export function randomJoinCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => JOIN_CODE_ALPHABET[b % 32]).join("");
}

export function normalizeJoinCode(code: string) {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** 長さが異なっても処理時間が変わらない比較 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export function timingSafeEqualString(a: string, b: string) {
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}

// ---------------------------------------------------------------------------
// パスワードのハッシュ (PBKDF2-HMAC-SHA256)
//   Better Auth 既定の scrypt は JavaScript 実装で CPU 負荷が高く、Workers の CPU 時間制限に
//   かかりやすい。Web Crypto (ネイティブ実装) の PBKDF2 を使う。
//   Workers の PBKDF2 は反復回数の上限が 100,000 回のため、上限値を使う。
//   形式: pbkdf2-sha256$<反復回数>$<salt(base64)>$<hash(base64)>
// ---------------------------------------------------------------------------
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_PREFIX = "pbkdf2-sha256";

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }) {
  const [prefix, iter, saltB64, hashB64] = hash.split("$");
  const iterations = Number(iter);
  if (
    prefix !== PBKDF2_PREFIX ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > PBKDF2_ITERATIONS ||
    !saltB64 ||
    !hashB64
  ) {
    return false;
  }
  const actual = await pbkdf2(password, fromBase64(saltB64), iterations);
  return timingSafeEqual(actual, fromBase64(hashB64));
}
