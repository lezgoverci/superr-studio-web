"use client";

import type { HubLevelCriterion, MemberLevel } from "@/lib/hub/types";
import { LEVEL_LABELS } from "@/lib/hub/content";

type LevelProgressBarProps = {
  nextLevel: MemberLevel | null;
  completedCriteria: HubLevelCriterion[];
  remainingCriteria: HubLevelCriterion[];
};

export function LevelProgressBar({
  nextLevel,
  completedCriteria,
  remainingCriteria,
}: LevelProgressBarProps) {
  const total = completedCriteria.length + remainingCriteria.length;
  const percent = total > 0 ? Math.round((completedCriteria.length / total) * 100) : 0;
  const allCriteria = [
    ...completedCriteria.map((c) => ({ ...c, completed: true as const })),
    ...remainingCriteria.map((c) => ({ ...c, completed: false as const })),
  ];

  return (
    <div className="space-y-3">
      {nextLevel ? (
        <p className="text-muted-foreground text-sm">
          Progress toward Level {nextLevel}: {LEVEL_LABELS[nextLevel]}
        </p>
      ) : null}

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="space-y-1.5">
        {allCriteria.map((criterion) => (
          <li
            className="flex items-center gap-2 text-sm"
            key={criterion.id}
          >
            <span
              className={
                criterion.completed
                  ? "text-primary"
                  : "text-muted-foreground"
              }
            >
              {criterion.completed ? "\u2713" : "\u25CB"}
            </span>
            <span
              className={
                criterion.completed
                  ? "text-foreground"
                  : "text-muted-foreground"
              }
            >
              {criterion.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
