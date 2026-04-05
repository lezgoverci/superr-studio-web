"use client";

import {
  Box,
  Brain,
  CircleUserRound,
  Coins,
  Compass,
  GitBranch,
  House,
  Layers,
  MessageSquare,
  Wrench,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import type { HubMemberProfile } from "@/lib/hub/types";
import { cn } from "@/lib/utils";
import { AppHeader } from "./app-header";
import { AppNav } from "./app-nav";
import { type AppShellArea, AppShellProvider } from "./shell-context";
import type { ShellNavItem, ShellUser } from "./types";

const DEFAULT_PERMISSIONS = [
  "route:hub:view",
  "route:journey:view",
  "route:brain:view",
  "route:earn:view",
  "route:profile:view",
  "route:studio:view",
  "route:assistant:view",
  "route:workflows:view",
  "route:sandboxes:view",
  "route:library:view",
] as const;

const WORKSPACE_NAV_ITEMS: ShellNavItem[] = [
  {
    id: "home",
    label: "Home",
    description: "Hub home",
    href: "/app",
    icon: House,
    requiredPermissions: ["route:hub:view"],
  },
  {
    id: "journey",
    label: "Journey",
    description: "Progress and next steps",
    href: "/app/journey",
    icon: Compass,
    requiredPermissions: ["route:journey:view"],
  },
  {
    id: "brain",
    label: "Brain",
    description: "Platform-managed NotebookLM workspace",
    href: "/app/brain",
    icon: Brain,
    requiredPermissions: ["route:brain:view"],
  },
  {
    id: "earn",
    label: "Earn",
    description: "Affiliate earnings and sharing",
    href: "/app/earn",
    icon: Coins,
    requiredPermissions: ["route:earn:view"],
  },
  {
    id: "profile",
    label: "Profile",
    description: "Member profile and goals",
    href: "/app/me",
    icon: CircleUserRound,
    requiredPermissions: ["route:profile:view"],
  },
];

const BUILDER_NAV_ITEMS: ShellNavItem[] = [
  {
    id: "studio",
    label: "Studio",
    description: "Builder access and guidance",
    href: "/app/studio",
    icon: Wrench,
    requiredPermissions: ["route:studio:view"],
  },
  {
    id: "assistant",
    label: "Assistant",
    description: "Full-page AI assistant",
    href: "/app/assistant",
    icon: MessageSquare,
    requiredPermissions: ["route:assistant:view"],
  },
  {
    id: "workflows",
    label: "Workflows",
    description: "Canvas builder",
    href: "/app/workflows",
    icon: GitBranch,
    requiredPermissions: ["route:workflows:view"],
  },
  {
    id: "sandboxes",
    label: "Sandboxes",
    description: "Managed sandbox environments",
    href: "/app/sandboxes",
    icon: Box,
    requiredPermissions: ["route:sandboxes:view"],
  },
  {
    id: "library",
    label: "Library",
    description: "Artifacts and assets",
    href: "/app/library",
    icon: Layers,
    requiredPermissions: ["route:library:view"],
  },
];

const LOCKED_BUILDER_ITEM_IDS = new Set(["workflows", "sandboxes", "library"]);
const WORKFLOW_EDITOR_PATH = /^\/app\/workflows\/[^/]+$/;

function isWorkflowCanvasRoute(pathname: string): boolean {
  return (
    pathname === "/app/workflows/new" || WORKFLOW_EDITOR_PATH.test(pathname)
  );
}

function resolveShellArea(pathname: string): AppShellArea {
  if (
    pathname === "/app/studio" ||
    pathname === "/app/assistant" ||
    pathname.startsWith("/app/workflows") ||
    pathname.startsWith("/app/sandboxes") ||
    pathname.startsWith("/app/library")
  ) {
    return "builder";
  }

  return "workspace";
}

type AppShellProps = {
  children: ReactNode;
  initialMemberProfile: HubMemberProfile | null;
};

export function AppShell({ children, initialMemberProfile }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [memberProfile, setMemberProfile] = useState<HubMemberProfile | null>(
    initialMemberProfile
  );

  const permissions = useMemo(
    () => new Set<string>([...DEFAULT_PERMISSIONS]),
    []
  );

  const hasPermission = useCallback(
    (permission: string) => permissions.has(permission),
    [permissions]
  );

  const refreshMemberProfile = useCallback(async () => {
    if (!session?.user) {
      setMemberProfile(null);
      return null;
    }

    try {
      const profile = await api.hub.profile.get();
      setMemberProfile(profile);
      return profile;
    } catch (error) {
      console.error("[app-shell] Failed to refresh member profile:", error);
      return null;
    }
  }, [session?.user]);

  useEffect(() => {
    if (session?.user && !initialMemberProfile) {
      refreshMemberProfile().catch(() => undefined);
    }
  }, [initialMemberProfile, refreshMemberProfile, session?.user]);

  const memberLevel = memberProfile?.level ?? 1;
  const isBuilderUnlocked = memberLevel >= 5;
  const builderEntryHref = isBuilderUnlocked
    ? "/app/workflows/new"
    : "/app/studio";
  const currentArea = resolveShellArea(pathname);

  const workspaceNavItems = useMemo(
    () =>
      WORKSPACE_NAV_ITEMS.filter((item) =>
        item.requiredPermissions.every((permission) =>
          hasPermission(permission)
        )
      ),
    [hasPermission]
  );

  const builderNavItems = useMemo(
    () =>
      BUILDER_NAV_ITEMS.filter((item) => {
        if (!isBuilderUnlocked && LOCKED_BUILDER_ITEM_IDS.has(item.id)) {
          return false;
        }

        return item.requiredPermissions.every((permission) =>
          hasPermission(permission)
        );
      }),
    [hasPermission, isBuilderUnlocked]
  );

  const navItems =
    currentArea === "builder" ? builderNavItems : workspaceNavItems;

  const user: ShellUser = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        isAnonymous: false,
      }
    : null;

  const shouldRedirectToWelcome = Boolean(
    session?.user &&
      memberProfile &&
      !memberProfile.onboardingCompletedAt &&
      pathname !== "/app/welcome"
  );
  const shouldRedirectFromWelcome = Boolean(
    session?.user &&
      pathname === "/app/welcome" &&
      memberProfile?.onboardingCompletedAt
  );
  const shouldRedirectLockedBuilderRoute =
    !isBuilderUnlocked &&
    (pathname.startsWith("/app/workflows") ||
      pathname.startsWith("/app/sandboxes") ||
      pathname.startsWith("/app/library"));

  useEffect(() => {
    if (shouldRedirectToWelcome) {
      router.replace("/app/welcome");
      return;
    }

    if (shouldRedirectLockedBuilderRoute) {
      router.replace("/app/studio");
      return;
    }

    if (shouldRedirectFromWelcome) {
      router.replace("/app");
    }
  }, [
    router,
    shouldRedirectFromWelcome,
    shouldRedirectLockedBuilderRoute,
    shouldRedirectToWelcome,
  ]);

  const isWorkflowCanvas = isWorkflowCanvasRoute(pathname);
  const showSideNav = !isWorkflowCanvas;

  if (
    shouldRedirectToWelcome ||
    shouldRedirectFromWelcome ||
    shouldRedirectLockedBuilderRoute
  ) {
    return <div className="h-dvh w-full bg-background" />;
  }

  return (
    <AppShellProvider
      value={{
        user,
        isAuthPending: isPending,
        permissions,
        hasPermission,
        memberProfile,
        memberLevel,
        isBuilderUnlocked,
        currentArea,
        builderEntryHref,
        workspaceNavItems,
        builderNavItems,
        navItems,
        refreshMemberProfile,
        setMemberProfile,
      }}
    >
      <div
        className={cn(
          "relative z-10 flex h-dvh flex-col",
          isWorkflowCanvas ? "pointer-events-none" : "pointer-events-auto"
        )}
      >
        <AppHeader />

        <div
          className={cn(
            "flex min-h-0 flex-1 overflow-hidden",
            isWorkflowCanvas
              ? "pointer-events-none bg-transparent"
              : "pointer-events-auto bg-muted/20"
          )}
        >
          {showSideNav ? <AppNav items={navItems} /> : null}
          <div
            className={cn(
              "min-h-0 flex-1 overflow-hidden",
              isWorkflowCanvas ? "pointer-events-none" : "pointer-events-auto"
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </AppShellProvider>
  );
}
