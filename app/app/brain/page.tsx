"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/app-shell/page-container";
import { useAppShellContext } from "@/components/app-shell/shell-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import type { HubBrainResponse } from "@/lib/hub/types";

export default function BrainPage() {
  const { refreshMemberProfile } = useAppShellContext();
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [addingUrl, setAddingUrl] = useState(false);
  const [addingText, setAddingText] = useState(false);
  const [brain, setBrain] = useState<HubBrainResponse | null>(null);
  const [url, setUrl] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadBrain() {
      const response = await api.hub.brain.get();
      if (!cancelled) {
        setBrain(response);
        setLoading(false);
      }
    }

    loadBrain().catch((error) => {
      console.error("[brain] Failed to load brain:", error);
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const provision = async () => {
    try {
      setProvisioning(true);
      const response = await api.hub.brain.provision();
      setBrain(response);
      await refreshMemberProfile();
      toast.success("Brain provisioned");
    } catch (error) {
      console.error("[brain] Failed to provision brain:", error);
      toast.error("Failed to provision the Brain");
    } finally {
      setProvisioning(false);
    }
  };

  const addUrlSource = async () => {
    if (!url.trim()) {
      toast.error("Enter a source URL.");
      return;
    }

    try {
      setAddingUrl(true);
      const response = await api.hub.brain.addUrlSource({ url });
      setBrain(response.brain);
      setUrl("");
      toast.success("URL source added");
    } catch (error) {
      console.error("[brain] Failed to add URL source:", error);
      toast.error("Failed to add URL source");
    } finally {
      setAddingUrl(false);
    }
  };

  const addTextSource = async () => {
    if (!(textTitle.trim() && textContent.trim())) {
      toast.error("Add both a title and pasted text.");
      return;
    }

    try {
      setAddingText(true);
      const response = await api.hub.brain.addTextSource({
        title: textTitle,
        content: textContent,
      });
      setBrain(response.brain);
      setTextTitle("");
      setTextContent("");
      toast.success("Text source added");
    } catch (error) {
      console.error("[brain] Failed to add text source:", error);
      toast.error("Failed to add text source");
    } finally {
      setAddingText(false);
    }
  };

  const canAddSources = Boolean(brain?.configured && brain.notebookId);

  return (
    <PageContainer contentClassName="max-w-5xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-semibold text-3xl tracking-tight">Brain</h1>
          <p className="max-w-2xl text-muted-foreground text-sm md:text-base">
            Your Brain is a platform-managed NotebookLM workspace. Members use
            the Hub UI while the platform handles provisioning and notebook
            access.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Notebook Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Status</p>
                  <p className="font-medium">
                    {brain?.status || "Not provisioned"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Notebook</p>
                  <p className="font-medium">
                    {brain?.notebookTitle || "Not provisioned"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Sources</p>
                  <p className="font-medium">{brain?.sourceCount ?? 0}</p>
                </div>
              </div>

              <p className="text-muted-foreground text-sm">
                {brain?.summary ||
                  "Provision the Brain to generate a shared NotebookLM workspace for this member."}
              </p>

              {brain?.serviceMessage ? (
                <div className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                  {brain.serviceMessage}
                </div>
              ) : null}

              <Button disabled={provisioning} onClick={provision}>
                {provisioning ? <Spinner className="mr-2 size-4" /> : null}
                {brain?.notebookId ? "Re-provision Brain" : "Provision Brain"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Starter Sources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {brain?.starterSources.map((source) => (
                <div
                  className="rounded-lg border bg-muted/30 p-4"
                  key={source.id}
                >
                  <p className="font-medium text-sm">{source.title}</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {source.description}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Add URL Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brain-url">Source URL</Label>
                <Input
                  id="brain-url"
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/article"
                  value={url}
                />
              </div>
              <Button
                disabled={addingUrl || !canAddSources}
                onClick={addUrlSource}
              >
                {addingUrl ? <Spinner className="mr-2 size-4" /> : null}
                Add URL
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add Text Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brain-text-title">Title</Label>
                <Input
                  id="brain-text-title"
                  onChange={(event) => setTextTitle(event.target.value)}
                  placeholder="Meeting notes"
                  value={textTitle}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brain-text-content">Pasted Text</Label>
                <Textarea
                  id="brain-text-content"
                  onChange={(event) => setTextContent(event.target.value)}
                  placeholder="Paste a useful note, transcript, or context block."
                  value={textContent}
                />
              </div>
              <Button
                disabled={addingText || !canAddSources}
                onClick={addTextSource}
              >
                {addingText ? <Spinner className="mr-2 size-4" /> : null}
                Add Text
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
