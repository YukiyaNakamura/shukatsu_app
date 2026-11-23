/**
 * アプリで扱う行の型 (D1 のスキーマ src/db/schema.ts と対応。日時は ISO 8601 の文字列)。
 * UI コンポーネントと API の入出力はこの型を使う。
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type UserRole = "STUDENT" | "ADMIN";
type OrgMemberRole = "OWNER" | "ADMIN";
type MembershipStatus = "ACTIVE" | "ENDED";
export type SelectionType = "INTERNSHIP" | "FULL_TIME";
export type ApplicationStatus = "PLANNED" | "IN_PROGRESS" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "CANCELLED";
export type StepType =
  | "ENTRY"
  | "DOCUMENT"
  | "APTITUDE_TEST"
  | "GROUP_DISCUSSION"
  | "GROUP_INTERVIEW"
  | "FIRST_INTERVIEW"
  | "SECOND_INTERVIEW"
  | "THIRD_INTERVIEW"
  | "FINAL_INTERVIEW"
  | "MEETING"
  | "ASSIGNMENT"
  | "OTHER";
export type StepStatus = "NOT_STARTED" | "SCHEDULED" | "COMPLETED" | "SKIPPED";
export type StepResult = "PENDING" | "PASSED" | "FAILED";
type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
type InvitationRole = "STUDENT" | "ADMIN";
type DeletionRequestStatus = "REQUESTED" | "PROCESSING" | "COMPLETED" | "CANCELLED";

export type ProfileRow = {
  id: string;
  role: UserRole;
  full_name: string;
  university_name: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationRow = {
  id: string;
  name: string;
  created_by: string | null;
  join_code_hash: string | null;
  join_code_issued_at: string | null;
  created_at: string;
};

export type OrganizationMemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgMemberRole;
  joined_at: string;
};

export type StudentMembershipRow = {
  id: string;
  student_id: string;
  organization_id: string;
  status: MembershipStatus;
  consent_version: string;
  consented_at: string;
  joined_at: string;
  ended_at: string | null;
  ended_by: string | null;
};

export type ApplicationRow = {
  id: string;
  student_id: string;
  company_name: string;
  company_name_normalized: string;
  selection_type: SelectionType;
  is_early_selection: boolean;
  job_title: string | null;
  applied_at: string | null;
  company_url: string | null;
  priority: number | null;
  application_source: string | null;
  status: ApplicationStatus;
  current_step_id: string | null;
  memo: string | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SelectionStepRow = {
  id: string;
  application_id: string;
  step_type: StepType;
  display_name: string;
  position: number;
  status: StepStatus;
  result: StepResult | null;
  scheduled_at: string | null;
  deadline_at: string | null;
  location: string | null;
  meeting_url: string | null;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type EventRow = {
  id: string;
  student_id: string;
  application_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InvitationRow = {
  id: string;
  organization_id: string;
  email: string | null;
  invitee_role: InvitationRole;
  token_hash: string;
  created_by: string | null;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type JoinRequestRow = {
  id: string;
  student_id: string;
  organization_id: string;
  status: JoinRequestStatus;
  consent_version: string;
  consented_at: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

export type AuditLogRow = {
  id: number;
  actor_id: string | null;
  target_type: string;
  target_id: string;
  application_id: string | null;
  student_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_values: Json | null;
  new_values: Json | null;
  created_at: string;
};

export type AccountDeletionRequestRow = {
  id: string;
  user_id: string | null;
  status: DeletionRequestStatus;
  requested_at: string;
  processed_at: string | null;
};

export type ApplicationOverviewRow = {
  id: string;
  student_id: string;
  company_name: string;
  company_name_normalized: string;
  selection_type: SelectionType;
  is_early_selection: boolean;
  job_title: string | null;
  applied_at: string | null;
  priority: number | null;
  application_source: string | null;
  status: ApplicationStatus;
  current_step_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  current_step_type: StepType | null;
  current_step_name: string | null;
  current_step_status: StepStatus | null;
  current_step_result: StepResult | null;
  student_name: string | null;
  student_university: string | null;
};

export type CalendarItemKind = "STEP_SCHEDULE" | "STEP_DEADLINE" | "EVENT";

export type CalendarItemRow = {
  kind: CalendarItemKind;
  source_id: string;
  step_id: string | null;
  application_id: string | null;
  student_id: string;
  title: string;
  company_name: string | null;
  step_type: StepType | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  meeting_url: string | null;
  description: string | null;
  student_name: string | null;
};

export type StudentOverviewRow = {
  student_id: string;
  membership_id: string;
  full_name: string;
  university_name: string | null;
  joined_at: string;
  application_count: number;
  in_progress_count: number;
  accepted_count: number;
  last_updated_at: string | null;
};
