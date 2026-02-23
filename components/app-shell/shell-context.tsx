"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { ShellNavItem, ShellUser } from "./types";

export type AppShellContextValue = {
  user: ShellUser;
  isAuthPending: boolean;
  permissions: Set<string>;
  hasPermission: (permission: string) => boolean;
  navItems: ShellNavItem[];
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
