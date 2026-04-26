"use client";

import { ExternalLink, Loader2, ShieldAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/app-shell/page-container";
import { useAppShellContext } from "@/components/app-shell/shell-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolvePostWhopAccessRedirect } from "@/lib/auth-redirect";

export default function JoinPage() {
  const searchParams = useSearchParams();
  const { hasWhopCommunityAccess, refreshWhopAccess, whopAccess } =
    useAppShellContext();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const nextPath = resolvePostWhopAccessRedirect(searchParams.get("next"));
  const joinUrl = whopAccess?.joinUrl;
  const isUnavailable = whopAccess?.status === "unavailable";

  const handleCheckAgain = async () => {
    setIsRefreshing(true);

    try {
      const access = await refreshWhopAccess();

      if (!access) {
        toast.error("Failed to check Whop access.");
        return;
      }

      if (access.status === "active") {
        toast.success("Whop access confirmed. Redirecting...");
        return;
      }

      if (access.status === "missing_access") {
        toast.error(
          "Superr still cannot find your Whop membership. Join the community first, then try again."
        );
        return;
      }

      toast.error(access.message ?? "Whop access is unavailable right now.");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <PageContainer contentClassName="max-w-4xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-semibold text-3xl tracking-tight">
            Finish Whop Access
          </h1>
          <p className="max-w-2xl text-muted-foreground text-sm md:text-base">
            Your Superr account is created. Join the Whop community to unlock
            the workspace and continue to {nextPath}.
          </p>
        </div>

        {hasWhopCommunityAccess ? (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-center gap-3 p-6">
              <Loader2 className="size-5 animate-spin text-primary" />
              <p className="text-sm">Whop access confirmed. Redirecting...</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
            <CardHeader className="space-y-2">
              <CardTitle className="text-2xl">
                Join the Superr Whop community
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                Superr uses Whop membership to unlock the member workspace,
                builder tools, and connected settings.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                {joinUrl ? (
                  <Button asChild>
                    <a href={joinUrl} rel="noreferrer" target="_blank">
                      Join on Whop
                      <ExternalLink className="ml-2 size-4" />
                    </a>
                  </Button>
                ) : (
                  <Button disabled>Join on Whop</Button>
                )}
                <Button
                  disabled={isRefreshing}
                  onClick={handleCheckAgain}
                  variant="outline"
                >
                  {isRefreshing ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  I've joined, check again
                </Button>
              </div>

              <Alert>
                <ShieldAlert className="size-4" />
                <AlertTitle>
                  {isUnavailable
                    ? "Verification is temporarily unavailable"
                    : "No Whop membership found yet"}
                </AlertTitle>
                <AlertDescription>
                  {whopAccess?.message ??
                    "Join the Whop community, then come back here and ask Superr to check again."}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
