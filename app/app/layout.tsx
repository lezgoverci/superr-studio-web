import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";

type AppLayoutProps = {
  children: ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
