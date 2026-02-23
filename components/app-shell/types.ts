import type { LucideIcon } from "lucide-react";

export type ShellNavItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  requiredPermissions: string[];
};

export type ShellUser = {
  id: string;
  name: string | null;
  email: string | null;
  isAnonymous: boolean;
} | null;
