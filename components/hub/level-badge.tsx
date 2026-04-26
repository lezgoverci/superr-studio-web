"use client";

import { LEVEL_LABELS } from "@/lib/hub/content";
import type { MemberLevel } from "@/lib/hub/types";
import { cn } from "@/lib/utils";

type LevelBadgeProps = {
  level: MemberLevel;
  className?: string;
};

export function LevelBadge({ level, className }: LevelBadgeProps) {
  return (
    <div
      className={cn(
        "text-muted-foreground text-xs uppercase tracking-[0.24em]",
        className
      )}
    >
      {LEVEL_LABELS[level]}
    </div>
  );
}
