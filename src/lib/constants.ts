import type { ApplicationStatus, SelectionType, StepResult, StepStatus, StepType } from "@/types/database";

/** 共有同意の文言バージョン。文言を変えたら更新する */
export const CONSENT_VERSION = "2026-11-v1";

export const SHARED_SCOPE_ITEMS = [
  "過去・現在・今後作成するすべての応募",
  "選考ステップと選考結果",
  "面接日程と提出期限",
  "共有メモ",
  "独立した就活予定",
] as const;

export const SELECTION_TYPES = ["FULL_TIME", "INTERNSHIP"] as const satisfies readonly SelectionType[];
export const SELECTION_TYPE_LABELS: Record<SelectionType, string> = {
  FULL_TIME: "本選考",
  INTERNSHIP: "インターン",
};

export const APPLICATION_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "CANCELLED",
] as const satisfies readonly ApplicationStatus[];

export function applicationStatusLabel(status: ApplicationStatus, type: SelectionType): string {
  switch (status) {
    case "PLANNED":
      return "応募予定";
    case "IN_PROGRESS":
      return "選考中";
    case "ACCEPTED":
      return type === "INTERNSHIP" ? "参加決定" : "内定";
    case "REJECTED":
      return "不合格";
    case "WITHDRAWN":
      return "辞退";
    case "CANCELLED":
      return "選考中止";
  }
}

export const STEP_TYPES = [
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
] as const satisfies readonly StepType[];

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  ENTRY: "エントリー",
  DOCUMENT: "書類選考・ES",
  APTITUDE_TEST: "適性検査・Webテスト",
  GROUP_DISCUSSION: "グループディスカッション",
  GROUP_INTERVIEW: "グループ面接",
  FIRST_INTERVIEW: "一次面接",
  SECOND_INTERVIEW: "二次面接",
  THIRD_INTERVIEW: "三次面接",
  FINAL_INTERVIEW: "最終面接",
  MEETING: "面談",
  ASSIGNMENT: "課題・コーディングテスト",
  OTHER: "その他",
};

export const STEP_STATUSES = ["NOT_STARTED", "SCHEDULED", "COMPLETED", "SKIPPED"] as const satisfies readonly StepStatus[];
export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  NOT_STARTED: "未実施",
  SCHEDULED: "予定あり",
  COMPLETED: "実施済み",
  SKIPPED: "スキップ",
};

export const STEP_RESULTS = ["PENDING", "PASSED", "FAILED"] as const satisfies readonly StepResult[];
export const STEP_RESULT_LABELS: Record<StepResult, string> = {
  PENDING: "結果待ち",
  PASSED: "通過",
  FAILED: "不通過",
};

export const PRIORITY_LABELS: Record<number, string> = {
  5: "★★★★★ 第一志望群",
  4: "★★★★",
  3: "★★★",
  2: "★★",
  1: "★",
};

export const APPLICATION_SOURCE_SUGGESTIONS = [
  "企業HP",
  "ナビサイト",
  "逆求人サイト",
  "エージェント紹介",
  "大学・キャリアセンター",
  "OB・OG紹介",
  "イベント・説明会",
  "その他",
];

/** 最終更新がこの日数より前の学生を「要フォロー」とする */
export const STALE_STUDENT_DAYS = 14;
