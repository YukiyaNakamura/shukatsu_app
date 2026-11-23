# 選考管理アプリ — 就活の選考を管理する Web アプリ

就活生とキャリア支援エージェント向けの、応募企業・選考状況管理アプリです。

- 学生: スプレッドシート感覚で応募を管理 (組織に所属しなくても利用可。所属する場合は最大 1 組織)
- 管理者: 自組織に所属する学生全員の選考状況を閲覧・編集
- 学生と管理者は同じデータを共有し、楽観的ロックで同時編集の上書きを防止

| 分野 | 技術 |
|---|---|
| フロントエンド | Next.js 16 (App Router) / TypeScript / Tailwind CSS 4 / shadcn/ui (radix) / Lucide |
| ホスティング | Cloudflare Workers (`@opennextjs/cloudflare`) |
| データベース | Cloudflare D1 (SQLite) / Drizzle ORM |
| 認証 | Better Auth (メールアドレス + パスワード、メール確認、パスワード再設定) |
| メール送信 | Resend (HTTP API) |
| バリデーション | Zod 4 |
| テスト | Vitest + wrangler の D1 (本番と同じ workerd の D1 実装をメモリ上で起動) |

---

## 1. ローカル開発

```bash
npm install
cp .dev.vars.example .dev.vars   # BETTER_AUTH_SECRET と OPERATOR_TOKEN を設定する (下記)
npm run db:seed:local            # ローカル D1 にマイグレーションを適用し、テストアカウントを作成
npm run dev                      # http://localhost:3000
```

`.dev.vars` (ローカル専用。Git にコミットしない)

```
BETTER_AUTH_SECRET=<openssl rand -base64 32 の出力>
BETTER_AUTH_URL=http://localhost:3000
OPERATOR_TOKEN=<openssl rand -hex 32 の出力>
# RESEND_API_KEY=re_xxx   # 未設定なら、メールは送信せずサーバーのログ (ターミナル) に本文とリンクを出力する
```

- `next dev` でも Cloudflare のバインディング (D1) が使えます。データは `.wrangler/state` に保存されます
- テストアカウント (パスワードはすべて `0000`。ローカル専用のため、新規登録時の 8 文字ルールの対象外です)

  | メールアドレス | 種類 |
  |---|---|
  | `example@gmail.com` | 学生 (組織に所属していない) |
  | `member@example.com` | 学生 (テスト組織に所属) |
  | `admin@example.com` | 管理者 (テスト組織のオーナー) |

- 新規登録・パスワード再設定のメールは、ターミナルに出力されるリンクを開いて確認できます
- ローカル D1 を作り直す: サーバーを止めてから `npm run db:reset:local`

```bash
npm run lint
npm run typecheck
npm test             # D1 のアクセス制御・業務ルールのテスト + ユニットテスト
npm run preview      # 本番と同じ Workers ランタイム (workerd) でビルドして実行 http://localhost:8787
```

> `npm run preview` は本番ビルドのため、`RESEND_API_KEY` が未設定だとメールを送信できません (エラーをログに出します)。
> 8787 番ポートでログインするには `.dev.vars` の `BETTER_AUTH_URL` を `http://localhost:8787` にしてください。

### スキーマの変更

1. `src/db/schema.ts` を編集する
2. `npm run db:generate` で `drizzle/migrations/` にマイグレーション SQL を生成する
3. `npm run db:migrate:local` でローカルに適用、本番は `npm run db:migrate:remote`

> **iCloud について**: このプロジェクトが iCloud 同期対象のフォルダ (デスクトップ・書類) にあると、`.next` などに「… 2.js」のような重複ファイルが作られ、Turbopack のキャッシュが壊れます。`.next` / `.wrangler` は同期対象外の `*.nosync` へのシンボリックリンクにしてあります (リンク先のフォルダが消えると `next dev` が起動直後に終了するため、その場合は `mkdir -p .next.nosync .wrangler.nosync` を実行してください)。根本的には、プロジェクトを iCloud 同期対象外の場所 (例: `~/dev`) に置くことを推奨します。

---

## 2. Cloudflare Workers へのデプロイ

### 初回のみ

```bash
npx wrangler login                                   # ブラウザで Cloudflare にログイン
npx wrangler d1 create shukatsu-app                  # D1 データベースを作成
```

1. 出力された `database_id` を `wrangler.jsonc` の `d1_databases[0].database_id` に貼り付ける
2. マイグレーションを適用する: `npm run db:migrate:remote`
3. シークレットを設定する (値は対話的に入力)

   ```bash
   npx wrangler secret put BETTER_AUTH_SECRET    # openssl rand -base64 32 の出力 (ローカルとは別の値にする)
   npx wrangler secret put BETTER_AUTH_URL       # 本番 URL (例: https://shukatsu-app.<subdomain>.workers.dev)
   npx wrangler secret put RESEND_API_KEY        # Resend の API キー
   npx wrangler secret put OPERATOR_TOKEN        # openssl rand -hex 32 の出力 (運営者用 API)
   ```

4. `wrangler.jsonc` の `vars.MAIL_FROM` を、Resend で認証済みのドメインの送信元に変更する (例: `選考管理アプリ <no-reply@your-domain.jp>`)
5. Resend のダッシュボードで送信ドメインを追加し、表示される DNS レコード (SPF / DKIM) を設定する

### デプロイ

```bash
npm run deploy     # ビルド (OpenNext) → ビルド成果物の補正 → デプロイ (--keep-vars でダッシュボードの変数を保持)
```

- `BETTER_AUTH_URL` は、ブラウザでアクセスする URL と完全に一致させてください (認証 API の CSRF 対策で Origin を照合します)。独自ドメインを使う場合はそのドメインにします
- スキーマを変更したときは、デプロイの前に `npm run db:migrate:remote` を実行してください
- `npm run cf:build` の後に `scripts/patch-open-next.mjs` が自動で実行されます。OpenNext の proxy (ミドルウェア) のバンドルで、Cookie 付きのリクエストが 500 になる問題を補正するものです (詳細はスクリプト内のコメント)
- バンドルサイズ: 圧縮後 約 2.8 MiB。無料プランの上限 (3 MiB) に近いため、依存パッケージを追加する場合は `npx wrangler deploy --dry-run` でサイズを確認してください (有料プランの上限は 10 MiB)
- CPU 時間: パスワードのハッシュは Workers ネイティブの PBKDF2 (100,000 回) を使っています。無料プランの CPU 時間制限 (1 リクエスト 10ms) を超えることがあるため、本番運用では Workers Paid プランを推奨します

### 運営者の操作 (退会処理・監査ログの削除)

```bash
APP_URL=https://<本番 URL> OPERATOR_TOKEN=<トークン> npm run ops -- list
APP_URL=https://<本番 URL> OPERATOR_TOKEN=<トークン> npm run ops -- process-deletions --execute
APP_URL=https://<本番 URL> OPERATOR_TOKEN=<トークン> npm run ops -- purge-audit-logs --execute
```

`OPERATOR_TOKEN` が未設定の環境では、運営者用 API (`/api/ops`) は 404 を返します。

---

## 3. 設計の要点

### ディレクトリ

```
src/
├── proxy.ts                     # 未ログインのユーザーを /login へ (Cookie の有無のみ確認する一次防御)
├── db/
│   ├── schema.ts                # D1 のスキーマ (Drizzle)。認証テーブル + アプリのテーブル
│   └── index.ts                 # D1 → Drizzle クライアント
├── app/
│   ├── (auth)/                  # login / register / reset-password / update-password
│   ├── api/auth/[...all]/       # Better Auth のエンドポイント
│   ├── api/v1/                  # アプリの API (Route Handlers)
│   ├── api/ops/                 # 運営者用 API (OPERATOR_TOKEN で保護)
│   ├── auth/signout/            # ログアウト (フォーム送信)
│   ├── invite/[token]/          # 招待リンク (ログイン前でも組織名を確認可)
│   ├── (student)/student/       # dashboard / applications[/id] / calendar / organization / settings
│   └── (admin)/admin/           # dashboard / students[/id] / applications[/id] / companies / calendar / organization / settings
├── components/                  # ui (shadcn) / layouts / applications / selection / calendar / dashboard / organization / settings
├── lib/
│   ├── auth/                    # Better Auth の設定 (server.ts) / クライアント / セッション・ロール判定
│   ├── server/                  # アクセス制御 (access.ts)・監査ログ (audit.ts)・暗号・メール・環境変数
│   ├── data/                    # データアクセス層 (API と Server Component で共通。すべて DataContext の権限で動く)
│   ├── api/                     # Route Handler 共通処理 (認証・Zod・エラー変換・CSRF 対策)
│   ├── validations/             # Zod スキーマ (クライアントとサーバーで共通)
│   └── utils/datetime.ts        # 日本時間 (Asia/Tokyo) の変換
└── types/database.ts            # アプリで扱う行の型
drizzle/migrations/              # D1 のマイグレーション SQL (npm run db:generate で生成)
scripts/                         # seed-local.mjs (ローカルのテストアカウント) / ops.mjs (運営者用) / patch-open-next.mjs
tests/db/                        # D1 上のアクセス制御・業務ルールのテスト
tests/unit/                      # Zod・エラー変換・日時のテスト
```

### 認証 (Better Auth)

- メールアドレス + パスワード。**メールアドレスの確認が完了するまでログインできません** (未確認でログインしようとすると確認メールを再送)
- 確認リンクを開いてもログインはしません。リンクを踏ませて他人のアカウントへ強制的にログインさせる「ログイン CSRF」への対策です
- パスワード再設定のリンクは 1 時間・1 回限り。再設定すると、その時点のセッションはすべて無効になります
- ログイン中のパスワード変更には現在のパスワードが必要で、他の端末のセッションは無効になります
- ロール (学生 / 管理者) はサインアップ時のみ選択できます。ユーザー情報を更新する Better Auth の API (`/update-user` など) は無効化し、氏名・大学名の変更はアプリの `/api/v1/me` だけで行います
- セッションは D1 に保存し、ページ・API のたびにサーバー側で検証します (Cookie キャッシュは使わないため、無効化は即時に反映されます)
- レート制限は D1 に保存します (Workers はインスタンス間でメモリを共有しないため)。ログインは 1 分 5 回、サインアップ・再設定メールは 1 分 3 回まで
- パスワードのハッシュは PBKDF2-HMAC-SHA256 (100,000 回、Workers の上限)。既定の scrypt は JavaScript 実装で CPU 時間を多く使うため置き換えています
- 登録の有無を推測されないよう、再設定メールの送信結果は常に同じ応答にし、メールの送信は応答後に行います

### 認可 (サーバー側のアクセス制御)

D1 には Row Level Security が無いため、**すべてのデータアクセスを `src/lib/data/*` の関数経由に限定し**、そこで必ず権限を検証します。

- 学生データを読み書きするクエリは、必ず `canAccessStudentSql()` (`src/lib/server/access.ts`) を WHERE 句に含めます: **本人、または「その学生が ACTIVE 所属している組織」の管理者**のみ
- 所属を解除 (`status = ENDED`) すると、次のクエリから管理者のアクセスは失効します (キャッシュなし)
- 更新・削除の文自体にも同じ条件を入れるため、確認と書き込みの間に所属が解除されても、他人のデータは書き換わりません
- アクセスできない応募・ステップ・予定は「存在しない」(404) として扱い、他組織のデータの存在も分からないようにしています
- API はクライアントから送られた `user_id` を使わず、サーバー側で検証したセッションのユーザーだけを信頼します。代理登録の `studentId` は「自組織に所属する学生」であることを検証します
- ACTIVE な所属は学生 1 人につき最大 1 件 (部分一意インデックス)。管理者は 1 人 1 組織 (一意制約)
- 現在の選考ステップは同じ応募に属する (複合外部キー `(id, current_step_id) → selection_steps(application_id, id)`)。予定に紐づける応募も同じ学生のもの (複合外部キー)
- 組織コードや招待トークンは **SHA-256 ハッシュのみ** を保存し、API の応答にも含めません
- 招待の受諾・参加申請の承認は「招待が未使用のまま」「申請が審査中のまま」を条件にした書き込みで処理し、同時に実行されても 1 回しか成功しません
- 組織コードは、入力の失敗が 1 時間に 10 回に達するとロックします (総当たり対策)
- 管理者が読める変更履歴は「現在の所属を開始した時点以降」の応募・ステップ・予定に関するものだけです。同意前の履歴や他組織への所属履歴は共有しません
- 状態を変更する API は Origin / Sec-Fetch-Site を検査し、クロスサイトからの送信を拒否します (CSRF 対策)。Better Auth の API も Origin を `BETTER_AUTH_URL` と照合します
- ログイン後の遷移先 `next` は URL として解決し、同一オリジンであることを確認します。制御文字やバックスラッシュを含むものは拒否します (オープンリダイレクト対策)
- セキュリティヘッダー: CSP (`connect-src 'self'`)、HSTS (本番のみ)、X-Frame-Options、nosniff、Referrer-Policy

### 同時編集と監査ログ

- `applications.version` / `selection_steps.version` は更新のたびに +1 します。API は `expectedVersion` が一致したときだけ更新し (`UPDATE ... WHERE version = ?`)、一致しなければ最新データを添えて **409** を返します
- UI は 409 を受け取ると入力内容を保持したまま「最新の内容を表示 / 自分の入力で上書き」を選ばせます
- D1 は対話的なトランザクション (BEGIN / COMMIT) を持たないため、複数の文は `db.batch()` (1 つのトランザクション) にまとめます。監査ログの INSERT も同じ batch に入れ、`changes()` (直前の文で更新された行数) を条件にして「更新できたときだけ」記録します
- UPDATE は変更された列だけを残し、トークンやハッシュ値は記録しません。保存期間は 1 年です (`npm run ops -- purge-audit-logs`)

### 退会

1. ユーザーが設定画面から退会を申請します (`account_deletion_requests`。処理前なら取り消せます)
2. 運営者が `npm run ops -- process-deletions --execute` を実行します (1 件ごとに 1 つのトランザクション)
   - 所有している組織: 他の管理者がいれば最も古い管理者へ所有権を移し、いなければ組織を削除します
   - ユーザーを削除すると、セッション・応募・ステップ・予定・所属が連鎖削除されます
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

- `tests/db/access.test.ts`: マイグレーションを適用した D1 に対して、他人・他組織のデータへのアクセス拒否、所属解除後の失効、権限昇格の防止、招待 (期限切れ・使用済み・メール不一致・同時受諾)、組織コード (総当たり対策)、二重所属の防止、楽観的ロックと同時編集、監査ログの共有範囲、退会処理などを検証します
- `tests/db/primitives.test.ts`: サービス層が前提にしている D1 の挙動 (batch 内の `changes()`、エラー時のロールバック、CHECK 制約・外部キー) を検証します
- `tests/unit/*.test.ts`: Zod スキーマ、DB エラーから HTTP ステータスへの変換、日本時間の変換、オープンリダイレクト対策を検証します
