"use client";

import { AlertCircle, ExternalLink, Globe, Key, Rocket } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Overlay } from "./overlay";
import { useOverlay } from "./overlay-provider";
import type { OverlayComponentProps } from "./types";

type PublishWorkflowOverlayProps = OverlayComponentProps<{
  workflowId: string;
}>;

export function PublishWorkflowOverlay({
  overlayId,
  workflowId,
}: PublishWorkflowOverlayProps) {
  const { closeAll } = useOverlay();
  const [isPublishing, setIsPublishing] = useState(false);
  const [vercelToken, setVercelToken] = useState("");
  const [vercelTeamId, setVercelTeamId] = useState("");
  const [publishResult, setPublishResult] = useState<{
    url: string;
    workflowApiKey: string;
    projectName: string;
  } | null>(null);

  // Load token from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("vercel_token");
    const savedTeamId = localStorage.getItem("vercel_team_id");
    if (savedToken) {
      setVercelToken(savedToken);
    }
    if (savedTeamId) {
      setVercelTeamId(savedTeamId);
    }
  }, []);

  const handlePublish = async () => {
    if (!vercelToken) {
      toast.error("Vercel Token is required");
      return;
    }

    // Save to localStorage
    localStorage.setItem("vercel_token", vercelToken);
    localStorage.setItem("vercel_team_id", vercelTeamId);

    setIsPublishing(true);
    try {
      const response = await fetch(`/api/workflows/${workflowId}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ vercelToken, vercelTeamId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to publish");
      }

      setPublishResult(result);
      toast.success("Workflow published successfully!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to publish workflow"
      );
    } finally {
      setIsPublishing(false);
    }
  };

  if (publishResult) {
    return (
      <Overlay
        actions={[
          { label: "Close", onClick: closeAll },
          {
            label: "Open Deployment",
            onClick: () =>
              window.open(`https://${publishResult.url}`, "_blank"),
          },
        ]}
        overlayId={overlayId}
        title="Workflow Published"
      >
        <div className="space-y-4">
          <Alert className="border-primary/20 bg-primary/5" variant="default">
            <Rocket className="size-4 text-primary" />
            <AlertTitle>Success!</AlertTitle>
            <AlertDescription>
              Your workflow has been deployed to Vercel.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Deployment URL</Label>
            <div className="flex items-center gap-2 break-all rounded-md bg-muted p-2 font-mono text-sm">
              <Globe className="size-4 flex-shrink-0" />
              <a
                className="flex-1 hover:underline"
                href={`https://${publishResult.url}`}
                rel="noreferrer"
                target="_blank"
              >
                {publishResult.url}
              </a>
              <ExternalLink className="size-3 flex-shrink-0" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Workflow API Key</Label>
            <div className="flex items-center gap-2 break-all rounded-md bg-muted p-2 font-mono text-sm">
              <Key className="size-4 flex-shrink-0" />
              <span className="flex-1">{publishResult.workflowApiKey}</span>
            </div>
            <p className="text-muted-foreground text-xs">
              Save this key! You will need it to authorize requests to your
              workflow API.
            </p>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <p className="text-amber-800 text-xs dark:text-amber-200">
              <strong>Note:</strong> It may take a minute or two for Vercel to
              complete the build and for the URL to become active.
            </p>
          </div>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay
      actions={[
        {
          label: "Cancel",
          variant: "outline",
          onClick: closeAll,
          disabled: isPublishing,
        },
        {
          label: isPublishing ? "Publishing..." : "Publish to Vercel",
          onClick: handlePublish,
          loading: isPublishing,
          disabled: !vercelToken,
        },
      ]}
      overlayId={overlayId}
      title="Publish to Vercel"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Rocket className="size-5" />
          <p className="text-sm">
            Deploy your workflow as a standalone Next.js app.
          </p>
        </div>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="vercel-token">Vercel API Token</Label>
            <Input
              id="vercel-token"
              onChange={(e) => setVercelToken(e.target.value)}
              placeholder="At_..."
              type="password"
              value={vercelToken}
            />
            <p className="text-muted-foreground text-xs">
              You can create a token in your{" "}
              <a
                className="text-primary hover:underline"
                href="https://vercel.com/account/tokens"
                rel="noreferrer"
                target="_blank"
              >
                Vercel Account Settings
              </a>
              .
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vercel-team-id">Vercel Team ID (Optional)</Label>
            <Input
              id="vercel-team-id"
              onChange={(e) => setVercelTeamId(e.target.value)}
              placeholder="team_..."
              value={vercelTeamId}
            />
          </div>
        </div>

        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>What happens next?</AlertTitle>
          <AlertDescription className="text-xs">
            We will generate the code for your workflow, collect your
            integration credentials, and deploy everything to Vercel. Your
            credentials will be stored as Vercel Secrets.
          </AlertDescription>
        </Alert>
      </div>
    </Overlay>
  );
}
