# 選考ボード — 就活選考管理 Web アプリ

就活生とキャリア支援エージェント向けの、応募企業・選考状況管理アプリです。

- 学生: スプレッドシート感覚で応募を管理 (組織に所属しなくても利用可)
- 管理者: 自組織に所属する学生全員の選考状況を閲覧・編集
- 学生と管理者は同じデータを共有し、楽観的ロックで同時編集の上書きを防止

| 分野 | 技術 |
|---|---|
| フロントエンド | Next.js 16 (App Router) / TypeScript / Tailwind CSS 4 / shadcn/ui (radix) / Lucide |
| 認証・DB | Supabase Auth / Supabase PostgreSQL / Row Level Security |
| バリデーション | Zod 4 |
| ホスティング | Cloudflare Workers (`@opennextjs/cloudflare`) |
| テスト | Vitest + PGlite (WASM 版 PostgreSQL 上で実マイグレーションと RLS を検証) |

---

## 1. セットアップ

```bash
npm install
cp .env.example .env.local      # 値を Supabase プロジェクトのものに書き換える
cp .dev.vars.example .dev.vars  # npm run preview 用
```

`.env.local`

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # 旧形式の anon キーでも可 (NEXT_PUBLIC_SUPABASE_ANON_KEY)
```

> **Secret / service_role キーはアプリ本体では使用しません。** `.env.local` や Cloudflare に設定しないでください。
> 使うのは運営者用の退会処理スクリプト (`scripts/process-account-deletions.mjs`) だけです。

### Supabase へのマイグレーション適用

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push            # supabase/migrations/*.sql を適用
```

### Supabase ダッシュボードで行う設定

1. **Authentication → Sign In / Providers → Email**: 「Confirm email」を有効にし、パスワードの最小文字数を 8 にする
2. **Authentication → URL Configuration**
   - Site URL: 本番 URL (例: `https://shukatsu-app.<subdomain>.workers.dev`)
   - Redirect URLs: `http://localhost:3000/**`, `http://localhost:8787/**`, `https://<本番ドメイン>/**`
3. (推奨) **Authentication → Emails → Templates**: 確認メールやパスワード再設定のリンクを、別の端末で開いても動作するようにする
   - Confirm signup: `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`
   - Reset password: `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`
   - アプリは `redirectTo` を常に `https://<ドメイン>/auth/confirm?next=...` の形で渡すため、上の連結で正しい URL になります
   - テンプレートを変更しなくても、既定の PKCE フロー (`?code=`) で動作します。その場合は同じブラウザでリンクを開く必要があります。
4. 本番では独自の SMTP を設定してください。Supabase 標準の SMTP は送信数の制限が厳しいためです。

### 開発

```bash
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm test             # DB (RLS) テスト + ユニットテスト
npm run preview      # Cloudflare Workers ランタイム (workerd) でローカル実行 http://localhost:8787
```

---

## 2. Cloudflare Workers へのデプロイ

OpenNext for Cloudflare (`@opennextjs/cloudflare`) を使います。Cloudflare のドキュメントが案内している vinext はまだベータのため採用していません。

```bash
npx wrangler login                        # 初回のみ (ブラウザで Cloudflare にログイン)
npm run deploy                            # opennextjs-cloudflare build && deploy (--keep-vars)
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` は**ビルド時に**クライアントへ埋め込まれます。ローカルからデプロイする場合は `.env.local` (または `.env.production`) に設定してください。Workers Builds (GitHub 連携) を使う場合は「Build variables and secrets」に設定します。
- 現時点では Workers のランタイム変数・シークレットは不要です (サーバー側も同じ公開値を参照します)。
- `wrangler.jsonc` の `name` を変更する場合は、`services[0].service` も同じ名前に変更してください。
- バンドルサイズ: 圧縮後 約 2.1 MiB (無料プランの上限は 3 MiB)。
- Next.js 16 の `proxy.ts` (Node.js ミドルウェア) は OpenNext では実験的サポートです。`npm run preview` で動作を確認済みです。

---

## 3. 設計の要点

### ディレクトリ

```
src/
├── proxy.ts                     # セッション更新 + 未認証ユーザーを /login へ
├── app/
│   ├── (auth)/                  # login / register / reset-password / update-password
│   ├── auth/confirm, signout    # メール確認リンクの受け口 / ログアウト
│   ├── invite/[token]/          # 招待リンク (ログイン前でも組織名を確認可)
│   ├── (student)/student/       # dashboard / applications[/id] / calendar / organization / settings
│   ├── (admin)/admin/           # dashboard / students[/id] / applications[/id] / companies / calendar / organization / settings
│   └── api/v1/                  # Route Handlers
├── components/                  # ui (shadcn) / layouts / applications / selection / calendar / dashboard / organization / settings
├── lib/
│   ├── supabase/                # server / client / proxy クライアント
│   ├── auth/                    # セッション・ロール判定
│   ├── api/                     # Route Handler 共通処理 (認証・Zod・エラー変換・CSRF 対策)
│   ├── data/                    # データアクセス (API と Server Component で共通)
│   ├── validations/             # Zod スキーマ (クライアントとサーバーで共通)
│   └── utils/datetime.ts        # 日本時間 (Asia/Tokyo) の変換
└── types/database.ts            # Supabase の Database 型
supabase/migrations/             # schema → triggers → rls → functions → views
tests/db/                        # PGlite 上の RLS・業務ルールテスト
tests/unit/                      # Zod・エラー変換・日時のテスト
scripts/process-account-deletions.mjs
```

### 認可 (データベースレベル)

- アプリは **ユーザー本人の JWT** で PostgREST にアクセスするので、すべてのクエリに RLS が適用されます。Service Role キーはアプリに存在しません。
- `private.can_access_student(student_id)` = 本人、または「その学生が ACTIVE 所属している組織」の管理者。applications / selection_steps / events / audit_logs のポリシーはすべてこの関数を通ります。
- 所属を解除 (`status = ENDED`) すると、次のクエリから管理者のアクセスは失効します (キャッシュなし)。
- 権限昇格対策
  - `profiles.role` は列単位の権限で UPDATE を許可せず、トリガーでも変更を拒否
  - `organization_members` / `student_memberships` への直接 INSERT は不可。組織の作成・招待の受諾・申請の承認を行う関数の中だけで作成されます
  - 組織コードや招待トークンは **SHA-256 ハッシュのみ** を保存し、ハッシュ列にはクライアントの SELECT 権限を与えません
  - API はクライアントから送られた `user_id` を使わず、JWT の `sub` だけを信頼します。代理登録の `studentId` は RLS で検証します
- ACTIVE な所属は学生 1 人につき最大 1 件 (部分ユニークインデックス)
- 現在の選考ステップは同じ応募に属する (複合外部キー `(id, current_step_id) → selection_steps(application_id, id)`)
- 状態を変更する API は Origin / Sec-Fetch-Site を検査し、クロスサイトからの送信を拒否します (CSRF 対策)
- メールリンク (`token_hash`) は確認画面 `/auth/verify` でボタンを押したとき (POST) に初めて検証します。リンクを踏ませて他人のアカウントへ強制的にログインさせる「ログイン CSRF」への対策です
- ログイン後の遷移先 `next` は URL として解決し、同一オリジンであることを確認します。制御文字やバックスラッシュを含むものは拒否します (オープンリダイレクト対策)
- 招待の取り消しは `revoke_invitation()` 経由のみで、取り消しの解除はできません。管理者招待を取り消せるのはオーナーだけです
- 組織コードは、入力の失敗が 1 時間に 10 回に達するとロックします (総当たり対策)
- 管理者が読める変更履歴は「現在の所属を開始した時点以降」の応募・ステップ・予定に関するものだけです。同意前の履歴や他組織への所属履歴は共有しません
- 今後作成される public の関数やテーブルは、既定では anon / authenticated に公開されません
- セキュリティヘッダー: CSP、HSTS (本番のみ)、X-Frame-Options、nosniff、Referrer-Policy。CSP の `connect-src` は**ビルド時の** `NEXT_PUBLIC_SUPABASE_URL` から生成するため、ビルド時に必ず設定してください

### 同時編集と監査ログ

- `applications.version` / `selection_steps.version` はトリガーで +1。API は `expectedVersion` が一致したときだけ更新し、一致しなければ最新データを添えて **409** を返します。
- UI は 409 を受け取ると入力内容を保持したまま「最新の内容を表示 / 自分の入力で上書き」を選ばせます。
- 監査ログはトリガーが**同じトランザクション内で**記録します。UPDATE は変更された列だけを残し、トークンやハッシュ値は記録しません。
- 保存期間は 1 年です。期限を過ぎたログは `purge_old_audit_logs()` で削除します。

### 退会

1. ユーザーが設定画面から退会を申請します (`account_deletion_requests`。処理前なら取り消せます)
2. 運営者が `SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/process-account-deletions.mjs --execute` を実行します
   - 所有している組織: 他の管理者がいれば最も古い管理者へ所有権を移し、いなければ組織を削除します
   - `auth.users` を削除すると、プロフィール・応募・ステップ・予定・所属が連鎖削除されます
   - その学生のデータに関する監査ログは削除し、他人のデータに対する操作ログは `actor_id` を NULL にして匿名化します
   - 申請記録は `COMPLETED` として残し、`user_id` は NULL にします

組織からの脱退は「所属組織」画面で行います。退会とは別の操作で、応募データは削除されません。

### MVP の仕様上の判断

- 管理者は 1 人につき 1 組織のみ所属できます (`organization_members.user_id` を一意にしています)
- 招待リンクは 1 回限りです。複数の学生をまとめて招待するときは組織コードを使います
- 組織コードと招待 URL は発行時に 1 回だけ表示します。DB にはハッシュしか残らないためです
- 企業別一覧は、全角/半角・空白・「株式会社」などの表記ゆれを簡易的に正規化して集計しています

---

## 4. テスト

```bash
npm test
```

- `tests/db/rls.test.ts`: Supabase 互換の shim と全マイグレーションを適用した PGlite に対して、他人・他組織のデータへのアクセス拒否、所属解除後の失効、権限昇格の防止、招待 (期限切れ・使用済み・メール不一致)、組織コード、二重所属の防止、楽観的ロック、監査ログ、退会処理などを検証します
- `tests/unit/*.test.ts`: Zod スキーマ、DB エラーから HTTP ステータスへの変換、日本時間の変換、オープンリダイレクト対策を検証します
