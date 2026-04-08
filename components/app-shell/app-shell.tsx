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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { isWorkflowEditorRoute, resolveShellArea } from "@/lib/app-route-utils";
import { useSession } from "@/lib/auth-client";
import {
  buildNextPath,
  resolvePostWhopAccessRedirect,
} from "@/lib/auth-redirect";
import {
  type HubMemberProfile,
  type HubWhopAccess,
  isWhopCommunityAccessActive,
} from "@/lib/hub/types";
import { cn } from "@/lib/utils";
import { AppHeader } from "./app-header";
import { AppNav } from "./app-nav";
import { AppShellProvider } from "./shell-context";
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
    description: "Connected NotebookLM context brain",
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
type AppShellProps = {
  children: ReactNode;
  initialMemberProfile: HubMemberProfile | null;
  initialWhopAccess: HubWhopAccess | null;
};

function resolveOnboardingRedirectPath({
  hasUser,
  memberProfile,
  pathname,
}: {
  hasUser: boolean;
  memberProfile: HubMemberProfile | null;
  pathname: string;
}): string | null {
  if (hasUser && memberProfile && !memberProfile.onboardingCompletedAt) {
    return pathname === "/app/welcome" ? null : "/app/welcome";
  }

  if (hasUser && memberProfile?.onboardingCompletedAt && !memberProfile.role) {
    return pathname === "/app/welcome" || pathname === "/app/role"
      ? null
      : "/app/role";
  }

  if (
    hasUser &&
    pathname === "/app/welcome" &&
    memberProfile?.onboardingCompletedAt &&
    memberProfile.role
  ) {
    return "/app";
  }

  if (hasUser && pathname === "/app/role" && memberProfile?.role) {
    return "/app";
  }

  return null;
}

function resolveBuilderRedirectPath({
  isBuilderUnlocked,
  pathname,
}: {
  isBuilderUnlocked: boolean;
  pathname: string;
}): string | null {
  if (
    !isBuilderUnlocked &&
    (pathname.startsWith("/app/workflows") ||
      pathname.startsWith("/app/sandboxes") ||
      pathname.startsWith("/app/library"))
  ) {
    return "/app/studio";
  }

  return null;
}

function resolveWhopAccessRedirectPath({
  hasUser,
  hasWhopCommunityAccess,
  pathname,
  search,
  joinNextPath,
}: {
  hasUser: boolean;
  hasWhopCommunityAccess: boolean;
  pathname: string;
  search: string;
  joinNextPath: string | null;
}): string | null {
  if (!hasUser) {
    return null;
  }

  if (!hasWhopCommunityAccess) {
    if (pathname === "/app/join") {
      return null;
    }

    const joinUrl = new URL("/app/join", "http://localhost");
    joinUrl.searchParams.set("next", buildNextPath(pathname, search));
    return `${joinUrl.pathname}${joinUrl.search}`;
  }

  if (pathname === "/app/join") {
    return resolvePostWhopAccessRedirect(joinNextPath);
  }

  return null;
}

function resolveRedirectPath({
  hasUser,
  hasWhopCommunityAccess,
  isBuilderUnlocked,
  joinNextPath,
  memberProfile,
  pathname,
  search,
}: {
  hasUser: boolean;
  hasWhopCommunityAccess: boolean;
  isBuilderUnlocked: boolean;
  joinNextPath: string | null;
  memberProfile: HubMemberProfile | null;
  pathname: string;
  search: string;
}): string | null {
  const whopAccessRedirectPath = resolveWhopAccessRedirectPath({
    hasUser,
    hasWhopCommunityAccess,
    pathname,
    search,
    joinNextPath,
  });

  if (whopAccessRedirectPath) {
    return whopAccessRedirectPath;
  }

  if (hasUser && !hasWhopCommunityAccess) {
    return null;
  }

  return (
    resolveOnboardingRedirectPath({
      hasUser,
      memberProfile,
      pathname,
    }) ??
    resolveBuilderRedirectPath({
      isBuilderUnlocked,
      pathname,
    })
  );
}

export function AppShell({
  children,
  initialMemberProfile,
  initialWhopAccess,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const [memberProfile, setMemberProfile] = useState<HubMemberProfile | null>(
    initialMemberProfile
  );
  const [whopAccess, setWhopAccess] = useState<HubWhopAccess | null>(
    initialWhopAccess
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

  const refreshWhopAccess = useCallback(async () => {
    if (!session?.user) {
      setWhopAccess(null);
      return null;
    }

    try {
      const access = await api.hub.access.get();
      setWhopAccess(access);
      return access;
    } catch (error) {
      console.error("[app-shell] Failed to refresh Whop access:", error);
      return null;
    }
  }, [session?.user]);

  useEffect(() => {
    if (session?.user && !initialMemberProfile) {
      refreshMemberProfile().catch(() => undefined);
    }
  }, [initialMemberProfile, refreshMemberProfile, session?.user]);

  useEffect(() => {
    if (session?.user && !initialWhopAccess) {
      refreshWhopAccess().catch(() => undefined);
    }
  }, [initialWhopAccess, refreshWhopAccess, session?.user]);

  const memberLevel = memberProfile?.level ?? 1;
  const isBuilderUnlocked = memberLevel >= 5;
  const hasWhopCommunityAccess = isWhopCommunityAccessActive(whopAccess);
  const builderEntryHref = isBuilderUnlocked
    ? "/app/workflows/new"
    : "/app/studio";
  const currentArea = resolveShellArea(pathname);
  const search = searchParams.toString();
  const searchSuffix = search ? `?${search}` : "";
  const joinNextPath = searchParams.get("next");

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
  const redirectPath = resolveRedirectPath({
    hasUser: Boolean(session?.user),
    hasWhopCommunityAccess,
    isBuilderUnlocked,
    joinNextPath,
    memberProfile,
    pathname,
    search: searchSuffix,
  });

  useEffect(() => {
    if (redirectPath) {
      router.replace(redirectPath);
    }
  }, [redirectPath, router]);

  const isWorkflowCanvas = isWorkflowEditorRoute(pathname);
  const showSideNav = hasWhopCommunityAccess && !isWorkflowCanvas;

  if (redirectPath) {
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
        whopAccess,
        hasWhopCommunityAccess,
        memberLevel,
        isBuilderUnlocked,
        currentArea,
        builderEntryHref,
        workspaceNavItems,
        builderNavItems,
        navItems,
        refreshMemberProfile,
        refreshWhopAccess,
        setMemberProfile,
        setWhopAccess,
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
