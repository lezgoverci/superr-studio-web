"use client";

import { Copy, Key, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ApiKey = {
  id: string;
  name: string | null;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  key?: string;
};

function CreateApiKeyForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (key: ApiKey) => void;
}) {
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName || null }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create API key");
      }

      const newKey = await response.json();
      onCreated(newKey);
      toast.success("API key created successfully");
    } catch (error) {
      console.error("Failed to create API key:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create API key",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="key-name">Label (optional)</Label>
        <Input
          id="key-name"
          onChange={(e) => setKeyName(e.target.value)}
          placeholder="e.g., Production, Testing"
          value={keyName}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} variant="outline">
          Cancel
        </Button>
        <Button disabled={creating} onClick={handleCreate}>
          {creating ? <Spinner className="mr-2 size-4" /> : null}
          Create
        </Button>
      </div>
    </div>
  );
}

export function ApiKeysSection() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadApiKeys = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/api-keys");
      if (!response.ok) {
        throw new Error("Failed to load API keys");
      }
      const keys = await response.json();
      setApiKeys(keys);
    } catch (error) {
      console.error("Failed to load API keys:", error);
      toast.error("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  const handleKeyCreated = (newKey: ApiKey) => {
    setNewlyCreatedKey(newKey.key ?? null);
    setApiKeys((prev) => [newKey, ...prev]);
    setIsCreating(false);
  };

  const handleDelete = async (keyId: string) => {
    setDeleting(keyId);
    try {
      const response = await fetch(`/api/api-keys/${keyId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete API key");
      }

      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
      toast.success("API key deleted");
    } catch (error) {
      console.error("Failed to delete API key:", error);
      toast.error("Failed to delete API key");
    } finally {
      setDeleting(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>API Keys</CardTitle>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)} size="sm">
            <Plus className="mr-2 size-4" />
            New API Key
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isCreating && (
          <CreateApiKeyForm
            onCancel={() => setIsCreating(false)}
            onCreated={handleKeyCreated}
          />
        )}

        {newlyCreatedKey && (
          <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
            <p className="mb-2 font-medium text-sm text-yellow-600 dark:text-yellow-400">
              Copy your API key now. You won&apos;t be able to see it again!
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-2 py-1 font-mono text-xs">
                {newlyCreatedKey}
              </code>
              <Button
                onClick={() => copyToClipboard(newlyCreatedKey)}
                size="sm"
                variant="outline"
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <Button
              className="mt-2"
              onClick={() => setNewlyCreatedKey(null)}
              size="sm"
              variant="ghost"
            >
              Dismiss
            </Button>
          </div>
        )}

        {loading && (
          <div className="py-8 text-center text-muted-foreground text-sm">
            Loading...
          </div>
        )}

        {!loading && apiKeys.length === 0 && !isCreating && (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <Key className="mx-auto mb-2 size-8 opacity-50" />
            <p>No API keys yet</p>
            <p className="text-xs">
              Create an API key to authenticate webhook requests
            </p>
          </div>
        )}

        {!loading && apiKeys.length > 0 && (
          <div className="space-y-2">
            {apiKeys.map((apiKey) => (
              <AlertDialog key={apiKey.id}>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {apiKey.keyPrefix}...
                      </code>
                      {apiKey.name && (
                        <span className="truncate text-sm">{apiKey.name}</span>
                      )}
                    </div>
                    <p className="mt-1 text-muted-foreground text-xs">
                      Created {formatDate(apiKey.createdAt)}
                      {apiKey.lastUsedAt &&
                        ` · Last used ${formatDate(apiKey.lastUsedAt)}`}
                    </p>
                  </div>
                  <AlertDialogTrigger asChild>
                    <Button
                      disabled={deleting === apiKey.id}
                      size="sm"
                      variant="ghost"
                    >
                      {deleting === apiKey.id ? (
                        <span className="size-4" />
                      ) : (
                        <Trash2 className="size-4 text-destructive" />
                      )}
                    </Button>
                  </AlertDialogTrigger>
                </div>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this API key? Any webhooks
                      using this key will stop working immediately.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => handleDelete(apiKey.id)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
