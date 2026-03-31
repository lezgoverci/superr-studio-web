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
import type {
  HubBrainResponse,
  HubEarnResponse,
  HubLevelCheckResponse,
  HubProgressResponse,
} from "@/lib/hub/types";

function getLevelSummary(level: 1 | 2 | 3 | 4) {
  switch (level) {
    case 4:
      return "Run the platform like an owner. Your priority is shipping leverage and reusable systems.";
    case 3:
      return "You have Builder access. Turn your operating knowledge into workflows, sandboxes, and artifacts.";
    case 2:
      return "You are in creation mode. Keep publishing, collecting context, and distributing what you make.";
    default:
      return "Start by clarifying direction, building your Brain, and stacking visible reps inside the platform.";
  }
}

export default function HubHomePage() {
  const { builderEntryHref, isBuilderUnlocked, memberLevel, memberProfile, refreshMemberProfile, setMemberProfile } =
    useAppShellContext();
  const [loading, setLoading] = useState(true);
  const [levelingUp, setLevelingUp] = useState(false);
  const [progress, setProgress] = useState<HubProgressResponse | null>(null);
  const [brain, setBrain] = useState<HubBrainResponse | null>(null);
  const [earn, setEarn] = useState<HubEarnResponse | null>(null);
  const [levelCheck, setLevelCheck] = useState<HubLevelCheckResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHomeData() {
      setLoading(true);

      const [progressResult, brainResult, earnResult, levelResult] = await Promise.allSettled([
        api.hub.progress.get(),
        api.hub.brain.get(),
        api.hub.earn.get(),
        api.hub.level.check(),
      ]);

      if (cancelled) {
        return;
      }

      if (progressResult.status === "fulfilled") {
        setProgress(progressResult.value);
      }

      if (brainResult.status === "fulfilled") {
        setBrain(brainResult.value);
      }

      if (earnResult.status === "fulfilled") {
        setEarn(earnResult.value);
      }

      if (levelResult.status === "fulfilled") {
        setLevelCheck(levelResult.value);
      }

      setLoading(false);
    }

    loadHomeData().catch((error) => {
      console.error("[hub/home] Failed to load home data:", error);
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const completionPercent = progress
    ? Math.round((progress.completedTasks / Math.max(progress.totalTasks, 1)) * 100)
    : 0;
  const welcomeHref = memberProfile?.onboardingCompletedAt ? "/app/me" : "/app/welcome";

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
      console.error("[hub/home] Failed to level up:", error);
      toast.error("Failed to level up");
    } finally {
      setLevelingUp(false);
    }
  };

  return (
    <PageContainer contentClassName="max-w-6xl">
      <div className="space-y-6">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
          <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <LevelBadge level={memberLevel} />
              <div className="space-y-2">
                <h1 className="font-semibold text-3xl tracking-tight">
                  {memberProfile?.displayName ||
                    memberProfile?.userName ||
                    "Welcome back"}
                </h1>
                <p className="max-w-2xl text-muted-foreground text-sm md:text-base">
                  {getLevelSummary(memberLevel)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href={memberProfile?.onboardingCompletedAt ? "/app/journey" : "/app/welcome"}>
                  {memberProfile?.onboardingCompletedAt
                    ? "Continue Journey"
                    : "Finish Onboarding"}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={builderEntryHref}>
                  {isBuilderUnlocked ? "Open Builder" : "Preview Builder"}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {levelCheck?.eligible && levelCheck.nextLevel ? (
          <Card className="border-green-500/30 bg-gradient-to-br from-green-500/10 via-background to-background">
            <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <h2 className="font-semibold text-xl">
                  Ready for Level {levelCheck.nextLevel}: {LEVEL_LABELS[levelCheck.nextLevel]}
                </h2>
                <p className="text-muted-foreground text-sm">
                  You have met all the criteria. Claim your next level now.
                </p>
              </div>
              <Button disabled={levelingUp} onClick={handleLevelUp}>
                {levelingUp ? <Spinner className="mr-2 size-4" /> : null}
                Level Up
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {levelCheck && !levelCheck.eligible && levelCheck.nextLevel ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Level Progress</CardTitle>
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Journey</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? <Spinner className="size-4" /> : null}
              <div className="font-semibold text-3xl">{completionPercent}%</div>
              <p className="text-muted-foreground text-sm">
                {progress
                  ? `${progress.completedTasks} of ${progress.totalTasks} tasks complete`
                  : "Track your next moves across the Hub."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Brain</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? <Spinner className="size-4" /> : null}
              <div className="font-semibold text-3xl">
                {brain?.sourceCount ?? 0}
              </div>
              <p className="text-muted-foreground text-sm">
                {brain?.configured
                  ? `${brain.status} · ${brain.notebookTitle ?? "Managed notebook"}`
                  : brain?.serviceMessage || "Provision your Brain and seed it with context."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Earn</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? <Spinner className="size-4" /> : null}
              <div className="font-semibold text-3xl">
                ${(earn?.totals.earningsUsd ?? 0).toFixed(0)}
              </div>
              <p className="text-muted-foreground text-sm">
                {earn?.configured
                  ? `${earn.totals.referrals} referrals tracked`
                  : earn?.message || "Whop affiliate data will appear here."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Builder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="font-semibold text-3xl">
                {isBuilderUnlocked ? "Open" : "Locked"}
              </div>
              <p className="text-muted-foreground text-sm">
                {isBuilderUnlocked
                  ? "Workflows, sandboxes, and library access are available."
                  : "Reach Level 3 to unlock the full Builder toolset."}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Next Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Link href={welcomeHref}>
                <Card className="h-full border-dashed transition-colors hover:border-primary/50">
                  <CardContent className="space-y-2 p-4">
                    <p className="font-medium">Profile and direction</p>
                    <p className="text-muted-foreground text-sm">
                      Keep your role, target role, and first goal current.
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/app/brain">
                <Card className="h-full border-dashed transition-colors hover:border-primary/50">
                  <CardContent className="space-y-2 p-4">
                    <p className="font-medium">Feed your Brain</p>
                    <p className="text-muted-foreground text-sm">
                      Add source material so the platform can reason over your work.
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/app/earn">
                <Card className="h-full border-dashed transition-colors hover:border-primary/50">
                  <CardContent className="space-y-2 p-4">
                    <p className="font-medium">Distribute and earn</p>
                    <p className="text-muted-foreground text-sm">
                      Get your share link and track the referrals you generate.
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href={builderEntryHref}>
                <Card className="h-full border-dashed transition-colors hover:border-primary/50">
                  <CardContent className="space-y-2 p-4">
                    <p className="font-medium">Builder path</p>
                    <p className="text-muted-foreground text-sm">
                      {isBuilderUnlocked
                        ? "Go straight into the workflow builder."
                        : "Preview what opens up at Level 3."}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brain Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? <Spinner className="size-4" /> : null}
              <p className="text-muted-foreground text-sm">
                {brain?.summary ||
                  "No summary yet. Provision the Brain and add your first sources."}
              </p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/app/brain">Open Brain</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
