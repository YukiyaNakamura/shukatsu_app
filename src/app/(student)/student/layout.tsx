import { AppShell } from "@/components/layouts/app-shell";
import { requireStudent } from "@/lib/auth/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStudent();
  return (
    <AppShell variant="student" userName={user.profile.full_name} subtitle={user.profile.university_name ?? user.email}>
      {children}
    </AppShell>
  );
}
