/**
 * Cloudflare D1 (SQLite) のスキーマ定義。
 *
 *  - 認証テーブル (user / session / account / verification / rate_limit) は Better Auth が使用する
 *  - アプリのテーブルは、既存の行の型 (src/types/database.ts) と同じ snake_case のキーにしている
 *  - 日時は ISO 8601 (UTC, ミリ秒付き) の文字列で保存する。文字列のまま大小比較できる
 *  - 応募データの所有者は常に学生本人 (applications.student_id)。
 *    組織は学生データを「所有」せず、ACTIVE な所属を通してのみ参照する (src/lib/server/access.ts)
 *
 * マイグレーションは `npm run db:generate` で drizzle/migrations に生成する。
 */
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

/** ISO 8601 の現在時刻 (例: 2026-11-23T03:00:51.917Z)。Date#toISOString と同じ形式 */
const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

const isoText = (name: string) => text(name);
const createdAt = () => isoText("created_at").notNull().default(nowIso);
const updatedAt = () => isoText("updated_at").notNull().default(nowIso);

export const USER_ROLES = ["STUDENT", "ADMIN"] as const;
export const ORG_MEMBER_ROLES = ["OWNER", "ADMIN"] as const;
export const MEMBERSHIP_STATUSES = ["ACTIVE", "ENDED"] as const;
export const JOIN_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const DELETION_REQUEST_STATUSES = ["REQUESTED", "PROCESSING", "COMPLETED", "CANCELLED"] as const;
const SELECTION_TYPES = ["INTERNSHIP", "FULL_TIME"] as const;
const APPLICATION_STATUSES = ["PLANNED", "IN_PROGRESS", "ACCEPTED", "REJECTED", "WITHDRAWN", "CANCELLED"] as const;
const STEP_TYPES = [
  "ENTRY",
  "DOCUMENT",
  "APTITUDE_TEST",
  "GROUP_DISCUSSION",
  "GROUP_INTERVIEW",
  "FIRST_INTERVIEW",
  "SECOND_INTERVIEW",
  "THIRD_INTERVIEW",
  "FINAL_INTERVIEW",
  "MEETING",
  "ASSIGNMENT",
  "OTHER",
] as const;
const STEP_STATUSES = ["NOT_STARTED", "SCHEDULED", "COMPLETED", "SKIPPED"] as const;
const STEP_RESULTS = ["PENDING", "PASSED", "FAILED"] as const;

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

// =============================================================================
// Better Auth
// =============================================================================

/** ユーザー (= プロフィール)。ロールはサインアップ時にのみ選択でき、以後は変更不可 */
export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    /** 氏名 */
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    role: text("role", { enum: USER_ROLES }).notNull(),
    universityName: text("university_name"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [
    check("user_role_check", sql`${t.role} in (${inList(USER_ROLES)})`),
    check("user_name_length", sql`length(trim(${t.name})) between 1 and 100`),
    check(
      "user_university_length",
      sql`${t.universityName} is null or length(trim(${t.universityName})) between 1 and 100`,
    ),
    check("user_student_requires_university", sql`${t.role} <> 'STUDENT' or ${t.universityName} is not null`),
  ],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Better Auth のレート制限 (Workers ではインスタンス間でメモリを共有できないため DB に保存) */
export const rateLimit = sqliteTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

// =============================================================================
// 組織
// =============================================================================

export const organizations = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    created_by: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** 組織コードの SHA-256。平文は保存せず、API でも返さない */
    join_code_hash: text("join_code_hash").unique(),
    join_code_issued_at: isoText("join_code_issued_at"),
    created_at: createdAt(),
  },
  (t) => [check("organizations_name_length", sql`length(trim(${t.name})) between 1 and 100`)],
);

/** 組織の管理者。MVP では管理者 1 人につき 1 組織 */
export const organizationMembers = sqliteTable(
  "organization_members",
  {
    id: text("id").primaryKey(),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .unique("organization_members_one_org_per_admin")
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ORG_MEMBER_ROLES }).notNull(),
    joined_at: isoText("joined_at").notNull().default(nowIso),
  },
  (t) => [
    check("organization_members_role_check", sql`${t.role} in (${inList(ORG_MEMBER_ROLES)})`),
    uniqueIndex("organization_members_one_owner").on(t.organization_id).where(sql`role = 'OWNER'`),
    index("organization_members_org_idx").on(t.organization_id),
  ],
);

/** 学生の組織所属。ACTIVE は学生 1 人につき最大 1 件 */
export const studentMemberships = sqliteTable(
  "student_memberships",
  {
    id: text("id").primaryKey(),
    student_id: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: text("status", { enum: MEMBERSHIP_STATUSES }).notNull().default("ACTIVE"),
    consent_version: text("consent_version").notNull(),
    consented_at: isoText("consented_at").notNull(),
    joined_at: isoText("joined_at").notNull().default(nowIso),
    ended_at: isoText("ended_at"),
    ended_by: text("ended_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    check("student_memberships_status_check", sql`${t.status} in (${inList(MEMBERSHIP_STATUSES)})`),
    check("student_memberships_consent_version_length", sql`length(${t.consent_version}) between 1 and 50`),
    check("student_memberships_ended_consistency", sql`(${t.status} = 'ACTIVE') = (${t.ended_at} is null)`),
    uniqueIndex("student_memberships_one_active").on(t.student_id).where(sql`status = 'ACTIVE'`),
    index("student_memberships_org_active_idx").on(t.organization_id).where(sql`status = 'ACTIVE'`),
  ],
);

// =============================================================================
// 応募・選考ステップ・予定
// =============================================================================

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    student_id: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    company_name: text("company_name").notNull(),
    company_name_normalized: text("company_name_normalized").notNull().default(""),
    selection_type: text("selection_type", { enum: SELECTION_TYPES }).notNull(),
    is_early_selection: integer("is_early_selection", { mode: "boolean" }).notNull().default(false),
    job_title: text("job_title"),
    applied_at: text("applied_at"),
    company_url: text("company_url"),
    priority: integer("priority"),
    application_source: text("application_source"),
    status: text("status", { enum: APPLICATION_STATUSES }).notNull().default("PLANNED"),
    current_step_id: text("current_step_id"),
    memo: text("memo"),
    /** 楽観的ロック。更新のたびに +1 */
    version: integer("version").notNull().default(1),
    created_by: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updated_by: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
    deleted_at: isoText("deleted_at"),
  },
  (t) => [
    check("applications_company_name_length", sql`length(trim(${t.company_name})) between 1 and 200`),
    check("applications_selection_type_check", sql`${t.selection_type} in (${inList(SELECTION_TYPES)})`),
    check("applications_status_check", sql`${t.status} in (${inList(APPLICATION_STATUSES)})`),
    check("applications_job_title_length", sql`${t.job_title} is null or length(${t.job_title}) <= 200`),
    check(
      "applications_company_url_format",
      sql`${t.company_url} is null or (length(${t.company_url}) <= 2048 and (lower(substr(${t.company_url}, 1, 7)) = 'http://' or lower(substr(${t.company_url}, 1, 8)) = 'https://'))`,
    ),
    check("applications_priority_range", sql`${t.priority} is null or ${t.priority} between 1 and 5`),
    check("applications_source_length", sql`${t.application_source} is null or length(${t.application_source}) <= 100`),
    check("applications_memo_length", sql`${t.memo} is null or length(${t.memo}) <= 10000`),
    // 早期選考は本選考 (FULL_TIME) に含める
    check("applications_early_requires_full_time", sql`not ${t.is_early_selection} or ${t.selection_type} = 'FULL_TIME'`),
    // events から (student_id, id) で参照するための一意制約
    unique("applications_student_id_id_key").on(t.student_id, t.id),
    index("applications_student_idx").on(t.student_id, t.updated_at),
    index("applications_company_normalized_idx").on(t.company_name_normalized),
    // 現在の選考ステップは必ず同じ応募に属する (複合 FK で DB レベル保証)
    foreignKey({
      name: "applications_current_step_fk",
      columns: [t.id, t.current_step_id],
      foreignColumns: [selectionSteps.application_id, selectionSteps.id],
    }),
  ],
);

export const selectionSteps = sqliteTable(
  "selection_steps",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id")
      .notNull()
      .references((): AnySQLiteColumn => applications.id, { onDelete: "cascade" }),
    step_type: text("step_type", { enum: STEP_TYPES }).notNull(),
    display_name: text("display_name").notNull(),
    position: integer("position").notNull(),
    status: text("status", { enum: STEP_STATUSES }).notNull().default("NOT_STARTED"),
    result: text("result", { enum: STEP_RESULTS }),
    scheduled_at: isoText("scheduled_at"),
    deadline_at: isoText("deadline_at"),
    location: text("location"),
    meeting_url: text("meeting_url"),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    check("selection_steps_step_type_check", sql`${t.step_type} in (${inList(STEP_TYPES)})`),
    check("selection_steps_status_check", sql`${t.status} in (${inList(STEP_STATUSES)})`),
    check("selection_steps_result_check", sql`${t.result} is null or ${t.result} in (${inList(STEP_RESULTS)})`),
    check("selection_steps_display_name_length", sql`length(trim(${t.display_name})) between 1 and 100`),
    check("selection_steps_position_nonnegative", sql`${t.position} >= 0`),
    check("selection_steps_location_length", sql`${t.location} is null or length(${t.location}) <= 200`),
    check(
      "selection_steps_meeting_url_format",
      sql`${t.meeting_url} is null or (length(${t.meeting_url}) <= 2048 and (lower(substr(${t.meeting_url}, 1, 7)) = 'http://' or lower(substr(${t.meeting_url}, 1, 8)) = 'https://'))`,
    ),
    check("selection_steps_notes_length", sql`${t.notes} is null or length(${t.notes}) <= 5000`),
    // applications.current_step_id の複合外部キー参照先
    unique("selection_steps_application_id_id_key").on(t.application_id, t.id),
    index("selection_steps_application_idx").on(t.application_id, t.position),
    index("selection_steps_scheduled_idx").on(t.scheduled_at).where(sql`scheduled_at is not null`),
    index("selection_steps_deadline_idx").on(t.deadline_at).where(sql`deadline_at is not null`),
  ],
);

/** 独立した就活予定。選考ステップの日時はここに複製しない */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    student_id: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    application_id: text("application_id"),
    title: text("title").notNull(),
    starts_at: isoText("starts_at").notNull(),
    ends_at: isoText("ends_at"),
    description: text("description"),
    created_by: text("created_by").references(() => user.id, { onDelete: "set null" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [
    check("events_title_length", sql`length(trim(${t.title})) between 1 and 200`),
    check("events_description_length", sql`${t.description} is null or length(${t.description}) <= 5000`),
    check("events_time_order", sql`${t.ends_at} is null or ${t.ends_at} >= ${t.starts_at}`),
    // 紐づける応募は同じ学生のものに限る
    foreignKey({
      name: "events_application_fk",
      columns: [t.student_id, t.application_id],
      foreignColumns: [applications.student_id, applications.id],
    }),
    index("events_student_starts_idx").on(t.student_id, t.starts_at),
  ],
);

// =============================================================================
// 招待・参加申請
// =============================================================================

/** 招待リンク。トークンは SHA-256 ハッシュのみ保存 */
export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email"),
    invitee_role: text("invitee_role", { enum: USER_ROLES }).notNull().default("STUDENT"),
    token_hash: text("token_hash").notNull().unique(),
    created_by: text("created_by").references(() => user.id, { onDelete: "set null" }),
    expires_at: isoText("expires_at").notNull(),
    used_at: isoText("used_at"),
    used_by: text("used_by").references(() => user.id, { onDelete: "set null" }),
    revoked_at: isoText("revoked_at"),
    created_at: createdAt(),
  },
  (t) => [
    check("invitations_role_check", sql`${t.invitee_role} in (${inList(USER_ROLES)})`),
    check(
      "invitations_email_format",
      sql`${t.email} is null or (${t.email} = lower(${t.email}) and instr(${t.email}, '@') > 1 and length(${t.email}) <= 320)`,
    ),
    // 管理者招待は必ずメールアドレス指定
    check("invitations_admin_requires_email", sql`${t.invitee_role} = 'STUDENT' or ${t.email} is not null`),
    index("invitations_org_idx").on(t.organization_id, t.created_at),
  ],
);

/** 組織コードによる参加申請 */
export const joinRequests = sqliteTable(
  "join_requests",
  {
    id: text("id").primaryKey(),
    student_id: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: text("status", { enum: JOIN_REQUEST_STATUSES }).notNull().default("PENDING"),
    consent_version: text("consent_version").notNull(),
    consented_at: isoText("consented_at").notNull().default(nowIso),
    created_at: createdAt(),
    reviewed_at: isoText("reviewed_at"),
    reviewed_by: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    check("join_requests_status_check", sql`${t.status} in (${inList(JOIN_REQUEST_STATUSES)})`),
    check("join_requests_consent_version_length", sql`length(${t.consent_version}) between 1 and 50`),
    uniqueIndex("join_requests_one_pending").on(t.student_id).where(sql`status = 'PENDING'`),
    index("join_requests_org_idx").on(t.organization_id, t.status),
  ],
);

/** 組織コード入力の失敗記録 (総当たり対策。API からは参照しない) */
export const joinCodeFailures = sqliteTable(
  "join_code_failures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    attempted_at: isoText("attempted_at").notNull().default(nowIso),
  },
  (t) => [index("join_code_failures_user_idx").on(t.user_id, t.attempted_at)],
);

// =============================================================================
// 監査ログ・退会
// =============================================================================

/**
 * 変更履歴。書き込みはサービス層が保存処理と同じ batch (トランザクション) 内でのみ行う。
 * 秘密情報 (トークン・ハッシュ) は保存しない。保存期間は 1 年。
 */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actor_id: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    target_type: text("target_type").notNull(),
    target_id: text("target_id").notNull(),
    application_id: text("application_id"),
    student_id: text("student_id"),
    action: text("action", { enum: ["INSERT", "UPDATE", "DELETE"] }).notNull(),
    old_values: text("old_values", { mode: "json" }),
    new_values: text("new_values", { mode: "json" }),
    created_at: createdAt(),
  },
  (t) => [
    check("audit_logs_action_check", sql`${t.action} in ('INSERT', 'UPDATE', 'DELETE')`),
    index("audit_logs_application_idx").on(t.application_id, t.created_at),
    index("audit_logs_student_idx").on(t.student_id, t.created_at),
    index("audit_logs_created_idx").on(t.created_at),
  ],
);

/** 退会申請。処理後も申請記録は残す (user_id は NULL 化) */
export const accountDeletionRequests = sqliteTable(
  "account_deletion_requests",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").references(() => user.id, { onDelete: "set null" }),
    status: text("status", { enum: DELETION_REQUEST_STATUSES }).notNull().default("REQUESTED"),
    requested_at: isoText("requested_at").notNull().default(nowIso),
    processed_at: isoText("processed_at"),
  },
  (t) => [
    check("account_deletion_requests_status_check", sql`${t.status} in (${inList(DELETION_REQUEST_STATUSES)})`),
    uniqueIndex("account_deletion_requests_one_open")
      .on(t.user_id)
      .where(sql`status in ('REQUESTED', 'PROCESSING')`),
  ],
);

/** Better Auth の drizzle アダプターに渡すスキーマ (キーはモデル名) */
export const authSchema = { user, session, account, verification, rateLimit };
