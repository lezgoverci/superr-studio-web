"use client";

import { Loader2, Plus, Server, ServerOff, Trash2, Unplug } from "lucide-react";
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

type SavedConnection = {
  id: string;
  name: string | null;
  url: string;
  directory: string | null;
  username: string;
  isActive: boolean;
};

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
  isNewConnection: boolean
): string | null {
  if (!url) {
    return "Server URL is required";
  }

  if (!(password || !isNewConnection)) {
    return "Password is required for new connections";
  }

  return null;
}

export function OpenCodeServerSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(
    null
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newDirectory, setNewDirectory] = useState("");
  const [newUsername, setNewUsername] = useState(DEFAULT_OPENCODE_USERNAME);
  const [newPassword, setNewPassword] = useState("");

  const { status, verifyConnection, updateConnectionConfig } =
    useOpenCodeConnection();

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.opencode.getConnection();
      if (response.configured && response.connections) {
        setConnections(response.connections);
        setActiveConnectionId(response.activeConnectionId);
      } else {
        setConnections([]);
        setActiveConnectionId(null);
      }
    } catch (error) {
      console.error("Failed to load OpenCode connections:", error);
      toast.error("Failed to load OpenCode server settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections().catch((error) => {
      console.error("Failed to load OpenCode connections:", error);
    });
  }, [loadConnections]);

  const handleAddConnection = useCallback(async () => {
    const trimmedUrl = newUrl.trim();
    const trimmedDirectory = newDirectory.trim();
    const trimmedUsername = newUsername.trim() || DEFAULT_OPENCODE_USERNAME;
    const trimmedPassword = newPassword.trim();
    const trimmedName = newName.trim() || null;

    const validationError = validateConnectionInput(
      trimmedUrl,
      trimmedPassword,
      true
    );
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    try {
      const response = await api.opencode.saveConnection({
        url: trimmedUrl,
        directory: trimmedDirectory || undefined,
        username: trimmedUsername,
        password: trimmedPassword || undefined,
        name: trimmedName || undefined,
      });

      if (!(response.configured && response.connection)) {
        throw new Error("Connection was not saved");
      }

      setShowAddForm(false);
      setNewName("");
      setNewUrl("");
      setNewDirectory("");
      setNewUsername(DEFAULT_OPENCODE_USERNAME);
      setNewPassword("");

      await loadConnections();

      const activeConn = response.connection;
      updateConnectionConfig({
        url: activeConn.url,
        username: activeConn.username,
        ...(activeConn.directory ? { directory: activeConn.directory } : {}),
      });
      await verifyConnection();
      toast.success("OpenCode server added");
    } catch (error) {
      console.error("Failed to save OpenCode connection:", error);
      toast.error(
        resolveApiErrorMessage(error, "Failed to save OpenCode server")
      );
    } finally {
      setSaving(false);
    }
  }, [
    newUrl,
    newDirectory,
    newUsername,
    newPassword,
    newName,
    loadConnections,
    updateConnectionConfig,
    verifyConnection,
  ]);

  const handleDeleteConnection = useCallback(
    async (connectionId: string) => {
      setDeleting(true);
      try {
        await api.opencode.deleteConnection(connectionId);
        await loadConnections();
        const remaining = connections.filter((c) => c.id !== connectionId);
        if (remaining.length > 0 && connectionId === activeConnectionId) {
          const newActive = remaining[0];
          updateConnectionConfig({
            url: newActive.url,
            username: newActive.username,
            ...(newActive.directory ? { directory: newActive.directory } : {}),
          });
          await verifyConnection();
        } else if (remaining.length === 0) {
          updateConnectionConfig(null);
        }
        toast.success("Server removed");
      } catch (error) {
        console.error("Failed to delete OpenCode connection:", error);
        toast.error(resolveApiErrorMessage(error, "Failed to remove server"));
      } finally {
        setDeleting(false);
      }
    },
    [
      connections,
      activeConnectionId,
      loadConnections,
      updateConnectionConfig,
      verifyConnection,
    ]
  );

  const handleActivateConnection = useCallback(
    async (connectionId: string) => {
      setActivating(connectionId);
      try {
        const response = await api.opencode.activateConnection(connectionId);
        setConnections(response.connections);
        setActiveConnectionId(response.activeConnectionId);

        const activeConn = response.connections.find(
          (c) => c.id === response.activeConnectionId
        );
        if (activeConn) {
          updateConnectionConfig({
            url: activeConn.url,
            username: activeConn.username,
            ...(activeConn.directory
              ? { directory: activeConn.directory }
              : {}),
          });
          await verifyConnection();
        }
        toast.success("Active server updated");
      } catch (error) {
        console.error("Failed to activate connection:", error);
        toast.error(resolveApiErrorMessage(error, "Failed to activate server"));
      } finally {
        setActivating(null);
      }
    },
    [updateConnectionConfig, verifyConnection]
  );

  const cancelAddForm = useCallback(() => {
    setShowAddForm(false);
    setNewName("");
    setNewUrl("");
    setNewDirectory("");
    setNewUsername(DEFAULT_OPENCODE_USERNAME);
    setNewPassword("");
  }, []);

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

            {connections.length > 0 && (
              <div className="space-y-2">
                <Label>Saved Servers</Label>
                <div className="space-y-2">
                  {connections.map((conn) => (
                    <div
                      className={`flex items-center justify-between rounded-md border p-3 ${
                        conn.isActive
                          ? "border-emerald-500 bg-emerald-500/5"
                          : "bg-muted/30"
                      }`}
                      key={conn.id}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Server className="size-4 text-muted-foreground" />
                          <span className="truncate font-medium text-sm">
                            {conn.name || conn.url}
                          </span>
                          {conn.isActive && (
                            <span className="font-medium text-emerald-500 text-xs">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-muted-foreground text-xs">
                          {conn.url}
                        </p>
                        {conn.directory ? (
                          <p className="mt-0.5 truncate text-muted-foreground text-xs">
                            Directory: {conn.directory}
                          </p>
                        ) : null}
                      </div>
                      <div className="ml-2 flex items-center gap-1">
                        {!conn.isActive && (
                          <Button
                            disabled={activating === conn.id}
                            onClick={() => handleActivateConnection(conn.id)}
                            size="sm"
                            variant="ghost"
                          >
                            {activating === conn.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              "Use"
                            )}
                          </Button>
                        )}
                        <Button
                          disabled={deleting}
                          onClick={() => handleDeleteConnection(conn.id)}
                          size="sm"
                          variant="ghost"
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showAddForm ? (
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-2">
                  <Label htmlFor="server-name">Server Name (optional)</Label>
                  <Input
                    id="server-name"
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Local Dev, Production"
                    value={newName}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="opencode-server-url">Server URL</Label>
                  <Input
                    id="opencode-server-url"
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://your-opencode-server.example.com"
                    value={newUrl}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="opencode-server-username">Username</Label>
                  <Input
                    id="opencode-server-username"
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder={DEFAULT_OPENCODE_USERNAME}
                    value={newUsername}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="opencode-server-directory">
                    Working Directory (optional)
                  </Label>
                  <Input
                    id="opencode-server-directory"
                    onChange={(e) => setNewDirectory(e.target.value)}
                    placeholder="e.g., /Users/you/projects/your-repo"
                    value={newDirectory}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="opencode-server-password">Password</Label>
                  <Input
                    id="opencode-server-password"
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Server password"
                    type="password"
                    value={newPassword}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={saving}
                    onClick={handleAddConnection}
                    size="sm"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Add Server
                  </Button>
                  <Button
                    disabled={saving}
                    onClick={cancelAddForm}
                    size="sm"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                className="w-full"
                onClick={() => setShowAddForm(true)}
                variant="outline"
              >
                <Plus className="mr-2 size-4" />
                Add Server
              </Button>
            )}

            <p className="text-muted-foreground text-xs">
              Use any OpenCode server endpoint. Local servers are supported with
              localhost URLs, and remote servers must use HTTPS.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
