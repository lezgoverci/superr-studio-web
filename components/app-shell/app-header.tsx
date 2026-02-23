"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DeployButton } from "@/components/deploy-button";
import { GitHubStarsButton } from "@/components/github-stars-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { UserMenu } from "../workflows/user-menu";
import type { ShellNavItem } from "./types";

type AppHeaderProps = {
  items: ShellNavItem[];
};

const WORKFLOW_EDITOR_PATH = /^\/app\/workflows\/[^/]+$/;

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/app") {
    return pathname === "/app";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader({ items }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  const activeItem =
    items.find((item) => isItemActive(pathname, item.href)) ?? items[0];
  const isWorkflowSection = pathname.startsWith("/app/workflows");
  const isWorkflowEditor =
    pathname === "/app/workflows/new" || WORKFLOW_EDITOR_PATH.test(pathname);

  return (
    <header className="pointer-events-auto h-14 border-b bg-background/95 backdrop-blur">
      <div className="flex h-full items-center justify-between gap-3 px-3 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          <Link
            className="flex shrink-0 items-center gap-2 md:gap-3"
            href="/app"
          >
            <div className="rounded-lg bg-primary/15 p-1.5 text-primary">
              <Sparkles className="size-4" />
            </div>
            <span className="hidden font-semibold text-sm tracking-tight sm:inline md:text-base">
              Superr Workflow
            </span>
          </Link>

          {activeItem ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 flex max-w-[220px] items-center gap-2 rounded-full border px-3 py-1.5 font-medium text-sm transition-colors hover:bg-muted/60"
                  type="button"
                >
                  <span className="truncate">{activeItem.label}</span>
                  <ChevronDown className="size-3 shrink-0 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {items.map((item) => (
                  <DropdownMenuItem asChild key={item.id}>
                    <Link
                      className="flex items-center justify-between"
                      href={item.href}
                    >
                      <span>{item.label}</span>
                      {isItemActive(pathname, item.href) ? (
                        <span className="text-primary text-xs">Current</span>
                      ) : null}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <div className="hidden flex-1 items-center justify-center md:flex">
          <div className="relative flex h-9 w-56 items-center rounded-full border bg-muted/70 p-1">
            <div
              className={cn(
                "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-background shadow-sm transition-transform duration-300",
                isWorkflowSection ? "translate-x-full" : "translate-x-0"
              )}
            />
            <button
              className={cn(
                "relative z-10 flex-1 rounded-full font-medium text-xs transition-colors",
                isWorkflowSection ? "text-muted-foreground" : "text-foreground"
              )}
              onClick={() => router.push("/app")}
              type="button"
            >
              Workspace
            </button>
            <button
              className={cn(
                "relative z-10 flex-1 rounded-full font-medium text-xs transition-colors",
                isWorkflowSection ? "text-foreground" : "text-muted-foreground"
              )}
              onClick={() => router.push("/app/workflows")}
              type="button"
            >
              Builder
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          {pathname === "/app" ? (
            <div className="hidden items-center gap-2 lg:flex">
              <GitHubStarsButton />
              <DeployButton />
            </div>
          ) : null}

          {isWorkflowEditor ? (
            <Button asChild size="sm" variant="secondary">
              <Link href="/app/workflows">All Workflows</Link>
            </Button>
          ) : null}

          <UserMenu />
        </div>
      </div>
    </header>
  );
}
