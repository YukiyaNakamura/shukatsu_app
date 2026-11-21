"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Table2,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ADMIN_NAV, STUDENT_NAV, type NavKey } from "./nav-config";

const ICONS: Record<NavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  applications: Table2,
  students: Users,
  companies: Building2,
  calendar: CalendarDays,
  organization: UsersRound,
  settings: Settings,
};

type Props = {
  variant: "student" | "admin";
  userName: string;
  subtitle: string;
  children: React.ReactNode;
};

function NavLinks({ variant, onNavigate }: { variant: Props["variant"]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = variant === "admin" ? ADMIN_NAV : STUDENT_NAV;
  return (
    <nav className="grid gap-0.5" aria-label="メインナビゲーション">
      {items.map((item) => {
        const Icon = ICONS[item.key];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
              active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-2.5 text-sm font-semibold tracking-tight">
      <span className="grid size-6 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">選</span>
      選考ボード
    </Link>
  );
}

function UserBlock({ userName, subtitle }: { userName: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2 border-t px-2.5 pt-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{userName}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <form action="/auth/signout" method="post">
        <Button type="submit" variant="ghost" size="icon" aria-label="ログアウト" title="ログアウト">
          <LogOut className="size-4" />
        </Button>
      </form>
    </div>
  );
}

export function AppShell({ variant, userName, subtitle, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col gap-4 border-r bg-sidebar px-2 py-4 md:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto">
          <NavLinks variant={variant} />
        </div>
        <UserBlock userName={userName} subtitle={subtitle} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="メニューを開く">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-64 flex-col gap-4 bg-sidebar p-3">
              <SheetHeader className="p-0">
                <SheetTitle asChild>
                  <div>
                    <Brand />
                  </div>
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1">
                <NavLinks variant={variant} onNavigate={() => setOpen(false)} />
              </div>
              <UserBlock userName={userName} subtitle={subtitle} />
            </SheetContent>
          </Sheet>
          <Brand />
        </header>
        <main className="flex-1 px-4 py-5 md:px-8 md:py-7">{children}</main>
      </div>
    </div>
  );
}
