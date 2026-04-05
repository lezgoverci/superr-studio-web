"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/app-shell/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";
import type { HubEarnResponse } from "@/lib/hub/types";

export default function EarnPage() {
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [earn, setEarn] = useState<HubEarnResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEarn() {
      const response = await api.hub.earn.get();
      if (!cancelled) {
        setEarn(response);
        setLoading(false);
      }
    }

    loadEarn().catch((error) => {
      console.error("[earn] Failed to load earnings:", error);
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const copyShareLink = async () => {
    if (!earn?.shareLink) {
      return;
    }

    try {
      setCopying(true);
      await navigator.clipboard.writeText(earn.shareLink);
      toast.success("Share link copied");
    } catch (error) {
      console.error("[earn] Failed to copy share link:", error);
      toast.error("Failed to copy share link");
    } finally {
      setCopying(false);
    }
  };

  return (
    <PageContainer contentClassName="max-w-5xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-semibold text-3xl tracking-tight">Earn</h1>
          <p className="max-w-2xl text-muted-foreground text-sm md:text-base">
            Affiliate mechanics run through Whop behind the scenes. This page
            keeps the earning view inside the Hub instead of sending members
            into an external dashboard.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Referral Earnings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-semibold text-3xl">
                ${(earn?.totals.earningsUsd ?? 0).toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Referral Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-semibold text-3xl">
                ${(earn?.totals.revenueUsd ?? 0).toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">MRR</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-semibold text-3xl">
                ${(earn?.totals.monthlyRecurringRevenueUsd ?? 0).toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Referrals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-semibold text-3xl">
                {earn?.totals.referrals ?? 0}
              </div>
              <p className="mt-1 text-muted-foreground text-sm">
                {earn?.totals.activeMembers ?? 0} active members
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Share Link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              readOnly
              value={earn?.shareLink || "No share link available yet"}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={copying || !earn?.shareLink}
                onClick={copyShareLink}
              >
                {copying ? <Spinner className="mr-2 size-4" /> : null}
                Copy Link
              </Button>
              {earn?.username ? (
                <div className="rounded-lg border px-3 py-2 text-muted-foreground text-sm">
                  Username: {earn.username}
                </div>
              ) : null}
            </div>
            {earn?.message ? (
              <div className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                {earn.message}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
