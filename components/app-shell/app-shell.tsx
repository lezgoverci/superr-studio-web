"use client";

import {
  BookOpen,
  LayoutDashboard,
  MessagesSquare,
  Settings2,
  Workflow,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { AppHeader } from "./app-header";
import { AppNav } from "./app-nav";
import { AppShellProvider } from "./shell-context";
import type { ShellNavItem, ShellUser } from "./types";

const DEFAULT_PERMISSIONS = [
  "route:dashboard:view",
  "route:workflows:view",
  "route:sessions:view",
  "route:library:view",
  "route:settings:view",
] as const;

const NAV_ITEMS: ShellNavItem[] = [
  {
    id: "dashboard",
    label: "Home",
    description: "Workspace overview",
    href: "/app",
    icon: LayoutDashboard,
    requiredPermissions: ["route:dashboard:view"],
  },
  {
    id: "workflows",
    label: "Workflows",
    description: "Canvas builder",
    href: "/app/workflows",
    icon: Workflow,
    requiredPermissions: ["route:workflows:view"],
  },
  {
    id: "library",
    label: "Library",
    description: "Artifacts and assets",
    href: "/app/library",
    icon: BookOpen,
    requiredPermissions: ["route:library:view"],
  },
  {
    id: "sessions",
    label: "Sessions",
    description: "OpenCode conversation history",
    href: "/app/sessions",
    icon: MessagesSquare,
    requiredPermissions: ["route:sessions:view"],
  },
  {
    id: "settings",
    label: "Settings",
    description: "Team and preferences",
    href: "/app/settings",
    icon: Settings2,
    requiredPermissions: ["route:settings:view"],
  },
];

const WORKFLOW_EDITOR_PATH = /^\/app\/workflows\/[^/]+$/;

function isWorkflowCanvasRoute(pathname: string): boolean {
  return (
    pathname === "/app/workflows/new" || WORKFLOW_EDITOR_PATH.test(pathname)
  );
}

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();

  const permissions = useMemo(
    () => new Set<string>([...DEFAULT_PERMISSIONS]),
    []
  );

  const hasPermission = useCallback(
    (permission: string) => permissions.has(permission),
    [permissions]
  );

  const navItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) =>
        item.requiredPermissions.every((permission) =>
          hasPermission(permission)
        )
      ),
    [hasPermission]
  );

  const user: ShellUser = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        isAnonymous: false,
      }
    : null;

  const isWorkflowCanvas = isWorkflowCanvasRoute(pathname);
  const showSideNav = !isWorkflowCanvas;

  return (
    <AppShellProvider
      value={{
        user,
        isAuthPending: isPending,
        permissions,
        hasPermission,
        navItems,
      }}
    >
      <div className="pointer-events-auto relative z-10 flex h-dvh flex-col">
        <AppHeader />

        <div
          className={cn(
            "flex min-h-0 flex-1 overflow-hidden",
            isWorkflowCanvas ? "bg-transparent" : "bg-muted/20"
          )}
        >
          {showSideNav ? <AppNav items={navItems} /> : null}
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>
      </div>
    </AppShellProvider>
  );
}
