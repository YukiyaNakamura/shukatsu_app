/**
 * Supabase の Database 型 (supabase/migrations と対応)。
 * Supabase プロジェクト接続後は `npm run db:types` で自動生成したものに置き換え可能。
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

type Table<Row, Required extends keyof Row, Optional extends keyof Row = Exclude<keyof Row, Required>> = {
  Row: Row;
  Insert: { [K in Required]: Row[K] } & { [K in Optional]?: Row[K] };
  Update: { [K in keyof Row]?: Row[K] };
  Relationships: [];
};

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

type View<Row> = { Row: Row; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id" | "role" | "full_name">;
      organizations: Table<OrganizationRow, "name">;
      organization_members: Table<OrganizationMemberRow, "organization_id" | "user_id" | "role">;
      student_memberships: Table<StudentMembershipRow, "student_id" | "organization_id" | "consent_version" | "consented_at">;
      applications: Table<ApplicationRow, "student_id" | "company_name" | "selection_type">;
      selection_steps: Table<SelectionStepRow, "application_id" | "step_type" | "display_name" | "position">;
      events: Table<EventRow, "student_id" | "title" | "starts_at">;
      invitations: Table<InvitationRow, "organization_id" | "token_hash">;
      join_requests: Table<JoinRequestRow, "student_id" | "organization_id" | "consent_version">;
      audit_logs: Table<AuditLogRow, "target_type" | "target_id" | "action", Exclude<keyof AuditLogRow, "target_type" | "target_id" | "action">>;
      account_deletion_requests: Table<AccountDeletionRequestRow, never>;
    };
    Views: {
      application_overview: View<ApplicationOverviewRow>;
      calendar_items: View<CalendarItemRow>;
    };
    Functions: {
      create_organization: { Args: { p_name: string }; Returns: string };
      regenerate_join_code: { Args: Record<string, never>; Returns: string };
      disable_join_code: { Args: Record<string, never>; Returns: undefined };
      create_invitation: {
        Args: { p_email?: string | null; p_role?: InvitationRole };
        Returns: { invitation_id: string; token: string; expires_at: string }[];
      };
      revoke_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
      get_invitation: {
        Args: { p_token: string };
        Returns: {
          organization_name: string | null;
          invitee_role: InvitationRole | null;
          email_restricted: boolean | null;
          expires_at: string | null;
          state: "VALID" | "EXPIRED" | "USED" | "REVOKED" | "NOT_FOUND";
        }[];
      };
      accept_invitation: { Args: { p_token: string; p_consent_version?: string | null }; Returns: string };
      request_join: {
        Args: { p_code: string; p_consent_version: string };
        Returns: { request_id: string; organization_name: string }[];
      };
      cancel_join_request: { Args: { p_request_id: string }; Returns: undefined };
      review_join_request: { Args: { p_request_id: string; p_approve: boolean }; Returns: undefined };
      end_membership: { Args: { p_membership_id: string }; Returns: undefined };
      create_application: {
        Args: {
          p_student_id: string;
          p_company_name: string;
          p_selection_type: SelectionType;
          p_is_early_selection?: boolean;
          p_job_title?: string | null;
          p_status?: ApplicationStatus;
          p_use_template?: boolean;
        };
        Returns: ApplicationRow;
      };
      set_current_stage: {
        Args: { p_application_id: string; p_step_type: StepType; p_expected_version: number };
        Returns: ApplicationRow;
      };
      reorder_steps: { Args: { p_application_id: string; p_step_ids: string[] }; Returns: undefined };
      org_student_overview: { Args: Record<string, never>; Returns: StudentOverviewRow[] };
      request_account_deletion: { Args: Record<string, never>; Returns: string };
      cancel_account_deletion: { Args: Record<string, never>; Returns: undefined };
      process_account_deletion: { Args: { p_request_id: string }; Returns: undefined };
      purge_old_audit_logs: { Args: Record<string, never>; Returns: number };
    };
    Enums: {
      user_role: UserRole;
      org_member_role: OrgMemberRole;
      membership_status: MembershipStatus;
      selection_type: SelectionType;
      application_status: ApplicationStatus;
      step_type: StepType;
      step_status: StepStatus;
      step_result: StepResult;
      join_request_status: JoinRequestStatus;
      invitation_role: InvitationRole;
      deletion_request_status: DeletionRequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
