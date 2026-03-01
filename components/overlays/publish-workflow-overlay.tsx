"use client";

import { useState, useEffect } from "react";
import { ExternalLink, Globe, Key, Loader2, Rocket, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Overlay } from "./overlay";
import { useOverlay } from "./overlay-provider";
import type { OverlayComponentProps } from "./types";
import { toast } from "sonner";

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
    if (savedToken) setVercelToken(savedToken);
    if (savedTeamId) setVercelTeamId(savedTeamId);
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
      toast.error(error instanceof Error ? error.message : "Failed to publish workflow");
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
            onClick: () => window.open(`https://${publishResult.url}`, "_blank"),
          },
        ]}
        overlayId={overlayId}
        title="Workflow Published"
      >
        <div className="space-y-4">
          <Alert variant="default" className="bg-primary/5 border-primary/20">
            <Rocket className="size-4 text-primary" />
            <AlertTitle>Success!</AlertTitle>
            <AlertDescription>
              Your workflow has been deployed to Vercel.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Deployment URL</Label>
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm break-all font-mono">
              <Globe className="size-4 flex-shrink-0" />
              <a href={`https://${publishResult.url}`} target="_blank" rel="noreferrer" className="hover:underline flex-1">
                {publishResult.url}
              </a>
              <ExternalLink className="size-3 flex-shrink-0" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Workflow API Key</Label>
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm break-all font-mono">
              <Key className="size-4 flex-shrink-0" />
              <span className="flex-1">{publishResult.workflowApiKey}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Save this key! You will need it to authorize requests to your workflow API.
            </p>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md border border-amber-200 dark:border-amber-900/50">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Note:</strong> It may take a minute or two for Vercel to complete the build and for the URL to become active.
            </p>
          </div>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay
      actions={[
        { label: "Cancel", variant: "outline", onClick: closeAll, disabled: isPublishing },
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
          <p className="text-sm">Deploy your workflow as a standalone Next.js app.</p>
        </div>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="vercel-token">Vercel API Token</Label>
            <Input
              id="vercel-token"
              placeholder="At_..."
              type="password"
              value={vercelToken}
              onChange={(e) => setVercelToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              You can create a token in your{" "}
              <a
                href="https://vercel.com/account/tokens"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Vercel Account Settings
              </a>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vercel-team-id">Vercel Team ID (Optional)</Label>
            <Input
              id="vercel-team-id"
              placeholder="team_..."
              value={vercelTeamId}
              onChange={(e) => setVercelTeamId(e.target.value)}
            />
          </div>
        </div>

        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>What happens next?</AlertTitle>
          <AlertDescription className="text-xs">
            We will generate the code for your workflow, collect your integration credentials,
            and deploy everything to Vercel. Your credentials will be stored as Vercel Secrets.
          </AlertDescription>
        </Alert>
      </div>
    </Overlay>
  );
}
