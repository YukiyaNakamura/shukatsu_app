import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings/settings-page";
import { requireStudent } from "@/lib/auth/session";

export const metadata: Metadata = { title: "設定" };

export default async function StudentSettingsPage() {
  return <SettingsPage user={await requireStudent()} />;
}
