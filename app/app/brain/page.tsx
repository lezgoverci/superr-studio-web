"use client";

import { ExternalLink, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/app-shell/page-container";
import { useAppShellContext } from "@/components/app-shell/shell-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import type { HubBrainResponse } from "@/lib/hub/types";

const NOTEBOOKLM_URL = "https://notebooklm.google.com/";

export default function BrainPage() {
  const { refreshMemberProfile } = useAppShellContext();
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [addingUrl, setAddingUrl] = useState(false);
  const [addingText, setAddingText] = useState(false);
  const [brain, setBrain] = useState<HubBrainResponse | null>(null);
  const [notebookIdOrUrl, setNotebookIdOrUrl] = useState("");
  const [url, setUrl] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadBrain() {
      const response = await api.hub.brain.get();
      if (!cancelled) {
        setBrain(response);
        setNotebookIdOrUrl(response.notebookId ?? "");
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

  const handleLinkBrain = async () => {
    if (!notebookIdOrUrl.trim()) {
      toast.error("Paste a NotebookLM notebook URL or ID.");
      return;
    }

    try {
      setLinking(true);
      const response = await api.hub.brain.link({ notebookIdOrUrl });
      setBrain(response);
      setNotebookIdOrUrl(response.notebookId ?? notebookIdOrUrl);
      await refreshMemberProfile();
      toast.success("Brain linked");
    } catch (error) {
      console.error("[brain] Failed to link brain:", error);
      toast.error("Failed to link the Brain");
    } finally {
      setLinking(false);
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

  const canAddSources = Boolean(brain?.isLinked && brain.notebookId);

  return (
    <PageContainer contentClassName="max-w-5xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-semibold text-3xl tracking-tight">Brain</h1>
          <p className="max-w-2xl text-muted-foreground text-sm md:text-base">
            Your Brain lives in your own NotebookLM. Connect it here so the Hub
            can seed starter context, remember what matters to you, and shape
            more personal guidance.
          </p>
        </div>

        <Alert>
          <Link2 />
          <AlertTitle>Member-owned by design</AlertTitle>
          <AlertDescription>
            You keep ownership of the notebook on your Google account. The Hub
            syncs to it after you paste a notebook URL or raw notebook ID.
          </AlertDescription>
        </Alert>

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
                  <p className="font-medium">{brain?.status || "Not linked"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Notebook</p>
                  <p className="font-medium">
                    {brain?.notebookTitle || "Not linked"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Sources</p>
                  <p className="font-medium">{brain?.sourceCount ?? 0}</p>
                </div>
              </div>

              <p className="text-muted-foreground text-sm">
                {brain?.summary ||
                  "Link your NotebookLM notebook to make your Hub context-aware."}
              </p>

              {brain?.serviceMessage ? (
                <div className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                  {brain.serviceMessage}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button asChild type="button" variant="outline">
                  <a href={NOTEBOOKLM_URL} rel="noreferrer" target="_blank">
                    <ExternalLink className="mr-2 size-4" />
                    Open NotebookLM
                  </a>
                </Button>
              </div>
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
              <CardTitle>Connect Your Brain</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brain-link">Notebook URL or ID</Label>
                <Input
                  autoComplete="off"
                  id="brain-link"
                  name="brainLink"
                  onChange={(event) => setNotebookIdOrUrl(event.target.value)}
                  placeholder="https://notebooklm.google.com/notebook/... or paste the notebook ID…"
                  value={notebookIdOrUrl}
                />
                <p className="text-muted-foreground text-sm">
                  Use a notebook you already own. We will validate it, store the
                  linked ID, and apply starter sources once.
                </p>
              </div>
              <Button disabled={linking} onClick={handleLinkBrain}>
                {linking ? <Spinner className="mr-2 size-4" /> : null}
                {brain?.isLinked ? "Reconnect Brain" : "Link Brain"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add URL Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brain-url">Source URL</Label>
                <Input
                  id="brain-url"
                  name="brainUrl"
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add Text Source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
              <div className="space-y-2">
                <Label htmlFor="brain-text-title">Title</Label>
                <Input
                  id="brain-text-title"
                  name="brainTextTitle"
                  onChange={(event) => setTextTitle(event.target.value)}
                  placeholder="Weekly reflections…"
                  value={textTitle}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brain-text-content">Pasted Text</Label>
                <Textarea
                  id="brain-text-content"
                  name="brainTextContent"
                  onChange={(event) => setTextContent(event.target.value)}
                  placeholder="Paste a useful note, transcript, prompt, or context block…"
                  value={textContent}
                />
              </div>
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
    </PageContainer>
  );
}
