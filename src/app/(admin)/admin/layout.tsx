import { AppShell } from "@/components/layouts/app-shell";
import { getAdminContext } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAdminContext();
  return (
    <AppShell variant="admin" userName={ctx.profile.full_name} subtitle={ctx.membership?.organization_name ?? "組織未作成"}>
      {children}
    </AppShell>
  );
}
