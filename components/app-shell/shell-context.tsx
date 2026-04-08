"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type {
  HubMemberProfile,
  HubWhopAccess,
  MemberLevel,
} from "@/lib/hub/types";
import type { ShellNavItem, ShellUser } from "./types";

export type AppShellArea = "workspace" | "builder";

export type AppShellContextValue = {
  user: ShellUser;
  isAuthPending: boolean;
  permissions: Set<string>;
  hasPermission: (permission: string) => boolean;
  memberProfile: HubMemberProfile | null;
  whopAccess: HubWhopAccess | null;
  hasWhopCommunityAccess: boolean;
  memberLevel: MemberLevel;
  isBuilderUnlocked: boolean;
  currentArea: AppShellArea;
  builderEntryHref: string;
  workspaceNavItems: ShellNavItem[];
  builderNavItems: ShellNavItem[];
  navItems: ShellNavItem[];
  refreshMemberProfile: () => Promise<HubMemberProfile | null>;
  refreshWhopAccess: () => Promise<HubWhopAccess | null>;
  setMemberProfile: (profile: HubMemberProfile | null) => void;
  setWhopAccess: (access: HubWhopAccess | null) => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

type AppShellProviderProps = {
  value: AppShellContextValue;
  children: ReactNode;
};

export function AppShellProvider({ value, children }: AppShellProviderProps) {
  return (
    <AppShellContext.Provider value={value}>
      {children}
    </AppShellContext.Provider>
  );
}

export function useAppShellContext(): AppShellContextValue {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShellContext must be used within AppShellProvider");
  }
  return context;
}
