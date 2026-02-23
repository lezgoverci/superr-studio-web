"use client";

import type { ReactNode } from "react";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Keep this wrapper so auth behavior can be centralized if needed.
  return <>{children}</>;
}
