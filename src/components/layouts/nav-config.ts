export type NavKey = "dashboard" | "applications" | "students" | "companies" | "calendar" | "organization" | "settings";

export type NavItem = { key: NavKey; href: string; label: string };

export const STUDENT_NAV: NavItem[] = [
  { key: "dashboard", href: "/student/dashboard", label: "ダッシュボード" },
  { key: "applications", href: "/student/applications", label: "応募管理" },
  { key: "calendar", href: "/student/calendar", label: "カレンダー" },
  { key: "organization", href: "/student/organization", label: "所属組織" },
  { key: "settings", href: "/student/settings", label: "設定" },
];

export const ADMIN_NAV: NavItem[] = [
  { key: "dashboard", href: "/admin/dashboard", label: "ダッシュボード" },
  { key: "students", href: "/admin/students", label: "学生一覧" },
  { key: "applications", href: "/admin/applications", label: "応募管理" },
  { key: "companies", href: "/admin/companies", label: "企業別一覧" },
  { key: "calendar", href: "/admin/calendar", label: "カレンダー" },
  { key: "organization", href: "/admin/organization", label: "組織管理" },
  { key: "settings", href: "/admin/settings", label: "設定" },
];
