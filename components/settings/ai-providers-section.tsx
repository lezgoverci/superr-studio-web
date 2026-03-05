"use client";

import { AlertCircle, Key, Link as LinkIcon, Save, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { getOpenCodeClient } from "@/lib/opencode-client";

type Provider = {
  id: string;
  name?: string;
  description?: string;
};

type ProviderListResponse = {
  data?: {
    all: Provider[];
    connected: string[];
  };
};

type ProviderSettingsProps = {
  className?: string;
};

export function AiProvidersSection({ className }: ProviderSettingsProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

  const loadProviders = useCallback(async () => {
    const client = getOpenCodeClient();
    if (!client) {
      return;
    }
    setLoading(true);
    try {
      const resp = (await client.provider.list()) as ProviderListResponse;
      setProviders(resp.data?.all || []);
      setConnected(resp.data?.connected || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to load providers: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleSaveApiKey = async (providerId: string) => {
    const key = apiKeys[providerId];
    if (!key) {
      return;
    }

    const client = getOpenCodeClient();
    if (!client) {
      return;
    }

    try {
      await client.auth.set({
        path: { id: providerId },
        body: { type: "api", key },
      });
      toast.success(`Connected ${providerId}`);
      setApiKeys((prev) => ({ ...prev, [providerId]: "" }));
      loadProviders();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to connect: ${message}`);
    }
  };

  const handleRemoveApiKey = async (providerId: string) => {
    const client = getOpenCodeClient();
    if (!client) {
      return;
    }

    try {
      await client.auth.set({
        path: { id: providerId },
        body: { type: "api", key: "" },
      });
      toast.success(`Disconnected ${providerId}`);
      loadProviders();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to disconnect: ${message}`);
    }
  };

  const handleOAuth = async (providerId: string) => {
    const client = getOpenCodeClient();
    if (!client) {
      return;
    }

    try {
      await client.provider.oauth.authorize({
        path: { id: providerId },
        body: { method: 0 },
      });
      toast.info("Follow instructions in your browser to authenticate.");

      const interval = setInterval(async () => {
        const check = (await client.provider.list()) as ProviderListResponse;
        if (check.data?.connected?.includes(providerId)) {
          clearInterval(interval);
          toast.success(`Connected ${providerId} via OAuth`);
          loadProviders();
        }
      }, 2000);

      setTimeout(() => clearInterval(interval), 120_000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`OAuth failed: ${message}`);
    }
  };

  let content: ReactNode = null;

  if (loading) {
    content = (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  } else if (providers.length === 0) {
    content = (
      <div className="py-8 text-center text-muted-foreground text-sm">
        No providers available. Please check Agent server connection.
      </div>
    );
  } else {
    content = (
      <div className="space-y-4">
        {providers.map((p) => {
          const isConnected = connected.includes(p.id);
          const isOAuth =
            p.id.includes("gemini") || p.id.includes("antigravity");

          return (
            <div className="space-y-3 rounded-md border p-4" key={p.id}>
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm capitalize">
                  {p.name || p.id}
                </h3>
                {isConnected ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-500 text-xs">
                    Connected
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
                    Not Connected
                  </span>
                )}
              </div>

              {p.description && (
                <p className="text-muted-foreground text-xs">{p.description}</p>
              )}

              {!(isConnected || isOAuth) && (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Key className="absolute top-2 left-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8 text-xs"
                      onChange={(e) =>
                        setApiKeys((prev) => ({
                          ...prev,
                          [p.id]: e.target.value,
                        }))
                      }
                      placeholder="API Key"
                      type="password"
                      value={apiKeys[p.id] || ""}
                    />
                  </div>
                  <Button
                    className="h-8"
                    onClick={() => handleSaveApiKey(p.id)}
                    size="sm"
                  >
                    <Save className="mr-1.5 size-3.5" />
                    Save
                  </Button>
                </div>
              )}

              {!isConnected && isOAuth && (
                <div>
                  <Button
                    className="w-full text-xs"
                    onClick={() => handleOAuth(p.id)}
                    size="sm"
                    variant="outline"
                  >
                    <LinkIcon className="mr-2 size-3.5" />
                    Connect Account
                  </Button>
                  {p.id.includes("antigravity") && (
                    <div className="mt-2 flex items-start gap-1.5 rounded bg-amber-500/10 p-2 text-[10px] text-amber-600 leading-tight dark:text-amber-400">
                      <AlertCircle className="mt-0.5 size-3 shrink-0" />
                      <p>
                        Unofficial Google connection. Use a burner account to
                        avoid ToS bans.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {isConnected && (
                <div className="flex justify-end">
                  <Button
                    className="h-8 text-destructive text-xs"
                    onClick={() => handleRemoveApiKey(p.id)}
                    size="sm"
                    variant="ghost"
                  >
                    <Trash2 className="mr-1.5 size-3.5" />
                    Disconnect
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>AI Providers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{content}</CardContent>
    </Card>
  );
}
