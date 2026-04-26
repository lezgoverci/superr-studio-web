"use client";

import { Box, Loader2, Plus, Power, PowerOff, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { SandboxListItem } from "@/app/api/sandboxes/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Integration = { id: string; name: string; type: string };

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    running: { color: "bg-green-500", label: "Running" },
    stopped: { color: "bg-gray-400", label: "Stopped" },
    pending: { color: "bg-yellow-500", label: "Pending" },
    failed: { color: "bg-red-500", label: "Failed" },
  };
  const { color, label } = config[status] || {
    color: "bg-gray-400",
    label: status,
  };
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function CreateSandboxForm({
  integrations,
  onCreated,
}: {
  integrations: Integration[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [integrationId, setIntegrationId] = useState("");
  const [runtime, setRuntime] = useState("node24");
  const [isCreating, setIsCreating] = useState(false);

  const vercelIntegrations = integrations.filter((i) => i.type === "vercel");

  const handleCreate = async () => {
    if (!(name.trim() && integrationId)) {
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch("/api/sandboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), integrationId, runtime }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create sandbox");
      }
      setName("");
      onCreated();
    } catch (err) {
      console.error("Failed to create sandbox:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to create sandbox"
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 font-medium text-sm">Create Sandbox</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input
            onChange={(e) => setName(e.target.value)}
            placeholder="My sandbox"
            value={name}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Vercel Connection</Label>
          <Select onValueChange={setIntegrationId} value={integrationId}>
            <SelectTrigger>
              <SelectValue placeholder="Select connection" />
            </SelectTrigger>
            <SelectContent>
              {vercelIntegrations.length === 0 ? (
                <SelectItem disabled value="__none">
                  No Vercel connections
                </SelectItem>
              ) : (
                vercelIntegrations.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name || i.type}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Runtime</Label>
          <Select onValueChange={setRuntime} value={runtime}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="node24">Node.js 24</SelectItem>
              <SelectItem value="node22">Node.js 22</SelectItem>
              <SelectItem value="python3.13">Python 3.13</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            className="w-full"
            disabled={!(name.trim() && integrationId) || isCreating}
            onClick={handleCreate}
          >
            {isCreating ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}

function SandboxRow({
  sandbox,
  onAction,
}: {
  sandbox: SandboxListItem;
  onAction: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const act = async (action: "start" | "stop" | "delete") => {
    setLoading(action);
    try {
      const url =
        action === "delete"
          ? `/api/sandboxes/${sandbox.id}`
          : `/api/sandboxes/${sandbox.id}/${action}`;
      const method = action === "delete" ? "DELETE" : "POST";
      const res = await fetch(url, { method });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action} sandbox`);
      }
      onAction();
    } catch (err) {
      console.error(`Failed to ${action} sandbox:`, err);
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <Box className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="font-medium text-sm">{sandbox.name}</p>
          <p className="text-muted-foreground text-xs">
            {sandbox.runtime || "node24"} ·{" "}
            {sandbox.vercelSandboxId
              ? `ID: ${sandbox.vercelSandboxId.slice(0, 12)}…`
              : "No VM"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge status={sandbox.status} />
        <div className="flex gap-1">
          {sandbox.status !== "running" && (
            <Button
              disabled={!!loading}
              onClick={() => act("start")}
              size="sm"
              variant="outline"
            >
              {loading === "start" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Power className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          {sandbox.status === "running" && (
            <Button
              disabled={!!loading}
              onClick={() => act("stop")}
              size="sm"
              variant="outline"
            >
              {loading === "stop" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PowerOff className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          <Button
            disabled={!!loading}
            onClick={() => act("delete")}
            size="sm"
            variant="ghost"
          >
            {loading === "delete" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SandboxesPage() {
  const [sandboxes, setSandboxes] = useState<SandboxListItem[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [sbRes, intRes] = await Promise.all([
        fetch("/api/sandboxes"),
        fetch("/api/integrations"),
      ]);
      if (sbRes.ok) {
        setSandboxes(await sbRes.json());
      }
      if (intRes.ok) {
        setIntegrations(await intRes.json());
      }
    } catch (err) {
      console.error("Failed to load sandboxes:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  let sandboxesContent: ReactNode;
  if (isLoading) {
    sandboxesContent = (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (sandboxes.length === 0) {
    sandboxesContent = (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <Box className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">
          No sandboxes yet. Create one above.
        </p>
      </div>
    );
  } else {
    sandboxesContent = (
      <div className="space-y-2">
        {sandboxes.map((sb) => (
          <SandboxRow key={sb.id} onAction={refresh} sandbox={sb} />
        ))}
      </div>
    );
  }

  useEffect(() => {
    refresh();
    // Auto-refresh every 15 seconds
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-6 overflow-y-auto p-6">
      <div>
        <h1 className="font-semibold text-xl">Sandboxes</h1>
        <p className="text-muted-foreground text-sm">
          Manage persistent Vercel Sandbox VMs. Workflow steps can connect to
          these sandboxes instead of creating a new one each run.
        </p>
      </div>

      <CreateSandboxForm integrations={integrations} onCreated={refresh} />

      <div className="space-y-2">
        <h2 className="font-medium text-sm">Your Sandboxes</h2>
        {sandboxesContent}
      </div>
    </div>
  );
}
