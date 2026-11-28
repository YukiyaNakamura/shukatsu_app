import type { DB } from "@/db";

export type UserRole = "STUDENT" | "ADMIN";

/** 操作するユーザー。必ずサーバー側で検証したセッションから作る (クライアント送信の ID は信用しない) */
export type Actor = { id: string; role: UserRole; email: string };

/** データアクセス層に渡すコンテキスト。すべての関数はこの actor の権限で動作する */
export type DataContext = { db: DB; actor: Actor };
