"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/app-shell/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";
import type { HubProgressResponse } from "@/lib/hub/types";

export default function JourneyPage() {
  const [loading, setLoading] = useState(true);
  const [mutatingTaskId, setMutatingTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState<HubProgressResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      const response = await api.hub.progress.get();
      if (!cancelled) {
        setProgress(response);
        setLoading(false);
      }
    }

    loadProgress().catch((error) => {
      console.error("[journey] Failed to load progress:", error);
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTask = async (
    trackId: string,
    taskId: string,
    completed: boolean
  ) => {
    try {
      setMutatingTaskId(`${trackId}:${taskId}`);
      const updated = await api.hub.progress.update({
        trackId,
        taskId,
        completed,
      });
      setProgress(updated);
    } catch (error) {
      console.error("[journey] Failed to update task:", error);
      toast.error("Failed to update journey task");
    } finally {
      setMutatingTaskId(null);
    }
  };

  const completionPercent = progress
    ? Math.round(
        (progress.completedTasks / Math.max(progress.totalTasks, 1)) * 100
      )
    : 0;

  return (
    <PageContainer contentClassName="max-w-5xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-semibold text-3xl tracking-tight">My Journey</h1>
          <p className="max-w-2xl text-muted-foreground text-sm md:text-base">
            Track what you have already unlocked and the next tasks that will
            move you deeper into the platform.
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 p-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">
                Overall completion
              </p>
              <div className="font-semibold text-4xl">{completionPercent}%</div>
            </div>
            <p className="text-muted-foreground text-sm">
              {progress
                ? `${progress.completedTasks} of ${progress.totalTasks} tasks complete`
                : "Loading journey progress"}
            </p>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : null}

        <div className="space-y-4">
          {progress?.tracks.map((track) => (
            <Card key={track.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span>{track.title}</span>
                  <span className="text-muted-foreground text-sm">
                    {track.completedTasks}/{track.totalTasks}
                  </span>
                </CardTitle>
                <p className="text-muted-foreground text-sm">
                  {track.description}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {track.tasks.map((task) => {
                  const pending =
                    mutatingTaskId === `${task.trackId}:${task.taskId}`;

                  return (
                    <div
                      className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
                      key={task.taskId}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{task.title}</p>
                          <span className="rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide">
                            {task.isCompleted
                              ? "Done"
                              : task.isAvailable
                                ? "Available"
                                : "Locked"}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {task.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button asChild type="button" variant="outline">
                          <Link href={task.href}>Open</Link>
                        </Button>
                        <Button
                          disabled={pending || !task.isAvailable}
                          onClick={() =>
                            toggleTask(
                              task.trackId,
                              task.taskId,
                              !task.isCompleted
                            )
                          }
                          type="button"
                          variant={task.isCompleted ? "outline" : "default"}
                        >
                          {pending ? <Spinner className="mr-2 size-4" /> : null}
                          {task.isCompleted
                            ? "Mark Incomplete"
                            : "Mark Complete"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
