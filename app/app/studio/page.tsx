"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/app-shell/page-container";
import { useAppShellContext } from "@/components/app-shell/shell-context";
import { LevelBadge } from "@/components/hub/level-badge";
import { LevelProgressBar } from "@/components/hub/level-progress-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";
import { LEVEL_LABELS } from "@/lib/hub/content";
import type { HubLevelCheckResponse } from "@/lib/hub/types";

export default function StudioPage() {
  const {
    builderEntryHref,
    isBuilderUnlocked,
    memberLevel,
    refreshMemberProfile,
    setMemberProfile,
  } = useAppShellContext();
  const [levelCheck, setLevelCheck] = useState<HubLevelCheckResponse | null>(
    null
  );
  const [levelingUp, setLevelingUp] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadLevelCheck() {
      const check = await api.hub.level.check();
      if (!cancelled) {
        setLevelCheck(check);
      }
    }

    loadLevelCheck().catch((error) => {
      console.error("[studio] Failed to load level check:", error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLevelUp = async () => {
    try {
      setLevelingUp(true);
      const result = await api.hub.level.up();
      setLevelCheck(result);

      if (result.leveledUp) {
        const refreshed = await refreshMemberProfile();
        if (refreshed) {
          setMemberProfile(refreshed);
        }
        toast.success(
          `You've reached Level ${result.currentLevel}: ${LEVEL_LABELS[result.currentLevel]}!`
        );
      }
    } catch (error) {
      console.error("[studio] Failed to level up:", error);
      toast.error("Failed to level up");
    } finally {
      setLevelingUp(false);
    }
  };

  return (
    <PageContainer contentClassName="max-w-5xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <LevelBadge level={memberLevel} />
          <h1 className="font-semibold text-3xl tracking-tight">Studio</h1>
          <p className="max-w-2xl text-muted-foreground text-sm md:text-base">
            The Builder surface is separated from the member workspace. Level and
            readiness determine how much of the toolset is open right now.
          </p>
        </div>

        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
          <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <h2 className="font-semibold text-2xl">
                {isBuilderUnlocked
                  ? "Builder access is unlocked"
                  : "Builder access is staged"}
              </h2>
              <p className="max-w-2xl text-muted-foreground text-sm">
                {isBuilderUnlocked
                  ? "You can move straight into workflows, sandboxes, and library assets."
                  : "Use the Hub to strengthen your Journey, Brain, and distribution system before opening the full builder stack."}
              </p>
            </div>
            {levelCheck?.eligible && levelCheck.nextLevel ? (
              <Button disabled={levelingUp} onClick={handleLevelUp}>
                {levelingUp ? <Spinner className="mr-2 size-4" /> : null}
                Level Up to {LEVEL_LABELS[levelCheck.nextLevel]}
              </Button>
            ) : (
              <Button asChild>
                <Link href={builderEntryHref}>
                  {isBuilderUnlocked ? "Enter Builder" : "Return to Hub Path"}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {levelCheck && levelCheck.nextLevel ? (
          <Card>
            <CardHeader>
              <CardTitle>Level Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <LevelProgressBar
                completedCriteria={levelCheck.completedCriteria}
                nextLevel={levelCheck.nextLevel}
                remainingCriteria={levelCheck.remainingCriteria}
              />
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workflows</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Reusable automations and canvas-based campaign logic.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sandboxes</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Persistent managed runtimes for heavier operator workflows.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Library</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Artifacts and assets generated by the Builder toolchain.
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
