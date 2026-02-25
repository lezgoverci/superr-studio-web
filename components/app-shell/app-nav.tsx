"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ShellNavItem } from "./types";

type AppNavProps = {
  items: ShellNavItem[];
};

function normalizeNavHref(href: string): string {
  const [withoutHash] = href.split("#");
  const [pathname] = withoutHash.split("?");
  return pathname || "/";
}

export function isItemActive(pathname: string, href: string): boolean {
  const normalizedHref = normalizeNavHref(href);
  if (normalizedHref === "/app") {
    return pathname === "/app";
  }
  return (
    pathname === normalizedHref || pathname.startsWith(`${normalizedHref}/`)
  );
}

export function NavContent({
  items,
  onItemClick,
}: {
  items: ShellNavItem[];
  onItemClick?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="w-full flex-1 overflow-y-auto">
      {items.map((item) => {
        const active = isItemActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            className={cn(
              "group relative flex items-center justify-center rounded-md p-3 text-sm transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            href={item.href}
            key={item.id}
            onClick={onItemClick}
          >
            <Icon className="size-5 shrink-0" />
            {/* biome-ignore lint: tooltip classes need specific ordering */}
            <span className="absolute bg-popover left-full ml-2 opacity-0 px-2 py-1 rounded-md shadow-md text-sm transition-opacity whitespace-nowrap z-50 group-hover:opacity-100 pointer-events-none">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppNav({ items }: AppNavProps) {
  return (
    <aside className="pointer-events-auto z-20 hidden w-16 shrink-0 border-r bg-background p-2 lg:flex lg:flex-col">
      <NavContent items={items} />
    </aside>
  );
}
