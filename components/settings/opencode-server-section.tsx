"use client";

import { Loader2, Server, ServerOff, Unplug } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useOpenCodeConnection } from "@/components/ai-elements/opencode-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api } from "@/lib/api-client";
import { DEFAULT_OPENCODE_USERNAME } from "@/lib/opencode-server-utils";

function getStatusMeta(
  status: "checking" | "connected" | "disconnected" | "not-configured"
) {
  if (status === "connected") {
    return {
      icon: <Server className="size-4 text-emerald-500" />,
      label: "Connected",
      detail: "Your OpenCode server is reachable.",
    };
  }

  if (status === "disconnected") {
    return {
      icon: <ServerOff className="size-4 text-destructive" />,
      label: "Offline",
      detail: "Configuration exists, but the server is currently unreachable.",
    };
  }

  if (status === "not-configured") {
    return {
      icon: <Unplug className="size-4 text-muted-foreground" />,
      label: "Not Configured",
      detail: "Set your OpenCode server URL, username, and password.",
    };
  }

  return {
    icon: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
    label: "Checking",
    detail: "Verifying your OpenCode server connection.",
  };
}

function resolveApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}

function validateConnectionInput(
  url: string,
  password: string,
  hasSavedConnection: boolean
): string | null {
  if (!url) {
    return "Server URL is required";
  }

  if (!(password || hasSavedConnection)) {
    return "Password is required for new connections";
  }

  return null;
}

export function OpenCodeServerSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState(DEFAULT_OPENCODE_USERNAME);
  const [password, setPassword] = useState("");
  const [hasSavedConnection, setHasSavedConnection] = useState(false);

  const { status, verifyConnection, updateConnectionConfig } =
    useOpenCodeConnection();

  const loadConnection = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.opencode.getConnection();
      if (response.configured && response.connection) {
        setHasSavedConnection(true);
        setUrl(response.connection.url);
        setUsername(response.connection.username || DEFAULT_OPENCODE_USERNAME);
      } else {
        setHasSavedConnection(false);
        setUrl("");
        setUsername(DEFAULT_OPENCODE_USERNAME);
      }
    } catch (error) {
      console.error("Failed to load OpenCode connection:", error);
      toast.error("Failed to load OpenCode server settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnection().catch((error) => {
      console.error("Failed to load OpenCode connection:", error);
    });
  }, [loadConnection]);

  const saveConnection = useCallback(async () => {
    const trimmedUrl = url.trim();
    const trimmedUsername = username.trim() || DEFAULT_OPENCODE_USERNAME;
    const trimmedPassword = password.trim();

    const validationError = validateConnectionInput(
      trimmedUrl,
      trimmedPassword,
      hasSavedConnection
    );
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    try {
      const response = await api.opencode.saveConnection({
        url: trimmedUrl,
        username: trimmedUsername,
        ...(trimmedPassword ? { password: trimmedPassword } : {}),
      });

      if (!(response.configured && response.connection)) {
        throw new Error("Connection was not saved");
      }

      setHasSavedConnection(true);
      setPassword("");
      setUrl(response.connection.url);
      setUsername(response.connection.username || DEFAULT_OPENCODE_USERNAME);
      updateConnectionConfig({
        url: response.connection.url,
        username: response.connection.username,
      });
      await verifyConnection();
      toast.success("OpenCode server settings saved");
    } catch (error) {
      console.error("Failed to save OpenCode connection:", error);
      toast.error(
        resolveApiErrorMessage(error, "Failed to save OpenCode server settings")
      );
    } finally {
      setSaving(false);
    }
  }, [
    hasSavedConnection,
    password,
    updateConnectionConfig,
    url,
    username,
    verifyConnection,
  ]);

  const deleteConnection = useCallback(async () => {
    setDeleting(true);
    try {
      await api.opencode.deleteConnection();
      setHasSavedConnection(false);
      setPassword("");
      setUrl("");
      setUsername(DEFAULT_OPENCODE_USERNAME);
      updateConnectionConfig(null);
      toast.success("OpenCode server disconnected");
    } catch (error) {
      console.error("Failed to delete OpenCode connection:", error);
      toast.error(
        resolveApiErrorMessage(error, "Failed to disconnect OpenCode server")
      );
    } finally {
      setDeleting(false);
    }
  }, [updateConnectionConfig]);

  const statusMeta = getStatusMeta(status);

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Agent Server</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                {statusMeta.icon}
                <p className="font-medium text-sm">{statusMeta.label}</p>
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                {statusMeta.detail}
              </p>
            </div>

            <p className="text-muted-foreground text-xs">
              Use any OpenCode server endpoint. Local servers are supported with
              localhost URLs, and remote servers must use HTTPS.
            </p>

            <div className="space-y-2">
              <Label htmlFor="opencode-server-url">Server URL</Label>
              <Input
                id="opencode-server-url"
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://your-opencode-server.example.com"
                value={url}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="opencode-server-username">Username</Label>
              <Input
                id="opencode-server-username"
                onChange={(event) => setUsername(event.target.value)}
                placeholder={DEFAULT_OPENCODE_USERNAME}
                value={username}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="opencode-server-password">Password</Label>
              <Input
                id="opencode-server-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  hasSavedConnection
                    ? "Leave blank to keep current password"
                    : "Server password"
                }
                type="password"
                value={password}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button disabled={saving || deleting} onClick={saveConnection}>
                {saving ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                Save Connection
              </Button>
              <Button
                disabled={deleting || saving || !hasSavedConnection}
                onClick={deleteConnection}
                variant="outline"
              >
                {deleting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                Disconnect
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
