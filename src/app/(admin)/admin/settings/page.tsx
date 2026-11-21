import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings/settings-page";
import { getAdminContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "設定" };

export default async function AdminSettingsPage() {
  return <SettingsPage user={await getAdminContext()} />;
}
