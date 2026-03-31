"use client";

import { cn } from "@/lib/utils";
import type { MemberLevel } from "@/lib/hub/types";
import { LEVEL_LABELS } from "@/lib/hub/content";

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
      Level {level} · {LEVEL_LABELS[level]}
    </div>
  );
}
