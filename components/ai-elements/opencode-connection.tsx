"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  saveConnectionConfig,
  clearConnectionConfig,
  getConnectionConfig,
  pingOpenCode,
} from "@/lib/opencode-client";
import { cn } from "@/lib/utils";
import { Download, Settings, Wifi, WifiOff, Loader2, ExternalLink } from "lucide-react";

type ConnectionStatus = "checking" | "connected" | "disconnected" | "not-configured";
type OpenCodeConnectionTriggerVariant = "default" | "menu-item";

type OpenCodeConnectionProps = {
  onStatusChange?: (connected: boolean) => void;
  className?: string;
  triggerVariant?: OpenCodeConnectionTriggerVariant;
  onTriggerClick?: () => void;
  /** When true, renders only the Dialog (no trigger button). Use when rendering outside a dropdown. */
  dialogOnly?: boolean;
  /** Controlled open state for the dialog (used when rendered outside dropdown). */
  externalOpen?: boolean;
  /** Callback when external controlled open state changes. */
  onExternalOpenChange?: (open: boolean) => void;
};

export function OpenCodeConnection({
  onStatusChange,
  className,
  triggerVariant = "default",
  onTriggerClick,
  dialogOnly = false,
  externalOpen,
  onExternalOpenChange,
}: OpenCodeConnectionProps) {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [internalOpen, setInternalOpen] = useState(false);
  const showDialog = externalOpen !== undefined ? externalOpen : internalOpen;
  const setShowDialog = onExternalOpenChange !== undefined ? onExternalOpenChange : setInternalOpen;
  const [url, setUrl] = useState("http://localhost:4096");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const checkConnection = useCallback(async () => {
    const config = getConnectionConfig();
    if (!config) {
      setStatus("not-configured");
      onStatusChangeRef.current?.(false);
      return;
    }
    setStatus("checking");
    const ok = await pingOpenCode();
    const newStatus = ok ? "connected" : "disconnected";
    setStatus(newStatus);
    onStatusChangeRef.current?.(ok);
  }, []);

  // Check connection on mount and every 30 seconds
  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 30_000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  const handleOpenDialog = () => {
    onTriggerClick?.();
    const config = getConnectionConfig();
    if (config) {
      setUrl(config.url);
      setToken(config.token);
    } else {
      setUrl("http://localhost:4096");
      setToken("");
    }
    setError(null);
    setShowDialog(true);
  };

  // Populate fields when dialog is opened externally
  useEffect(() => {
    if (showDialog) {
      const config = getConnectionConfig();
      if (config) {
        setUrl(config.url);
        setToken(config.token);
      } else {
        setUrl("http://localhost:4096");
        setToken("");
      }
      setError(null);
    }
  }, [showDialog]);

  const handleSave = async () => {
    if (!url.trim() || !token.trim()) {
      setError("Server URL and auth token are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      saveConnectionConfig({ url: url.trim(), token: token.trim() });
      const ok = await pingOpenCode();
      if (!ok) {
        setError(
          "Could not connect to OpenCode server. Verify the URL/token and that the server is reachable."
        );
        return;
      }
      setStatus("connected");
      onStatusChangeRef.current?.(true);
      setShowDialog(false);
    } catch (err) {
      setError("Connection failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = () => {
    clearConnectionConfig();
    setStatus("not-configured");
    onStatusChangeRef.current?.(false);
    setShowDialog(false);
  };

  const statusConfig = {
    checking: {
      icon: <Loader2 className="size-2.5 animate-spin text-muted-foreground" />,
      label: "Checking...",
      dot: "bg-muted-foreground",
    },
    connected: {
      icon: <Wifi className="size-2.5 text-emerald-500" />,
      label: "AI Agent connected",
      dot: "bg-emerald-500",
    },
    disconnected: {
      icon: <WifiOff className="size-2.5 text-destructive" />,
      label: "AI Agent offline",
      dot: "bg-destructive",
    },
    "not-configured": {
      icon: <WifiOff className="size-2.5 text-muted-foreground" />,
      label: "AI Agent not set up",
      dot: "bg-muted-foreground",
    },
  };

  const current = statusConfig[status];
  const isMenuItemTrigger = triggerVariant === "menu-item";
  const compactStatusLabel =
    status === "connected"
      ? "Connected"
      : status === "disconnected"
        ? "Offline"
        : status === "not-configured"
          ? "Not set up"
          : "Checking";

  const triggerButton = (
    <button
      className={cn(
        isMenuItemTrigger
          ? "focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none"
          : "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
      onClick={handleOpenDialog}
      type="button"
    >
      {isMenuItemTrigger ? (
        <>
          <span className={cn("size-2 rounded-full shrink-0", current.dot)} />
          <span className="flex-1 text-left">OpenCode Connection</span>
          <span className="text-muted-foreground text-xs">{compactStatusLabel}</span>
        </>
      ) : (
        <>
          <span className={cn("size-1.5 rounded-full flex-shrink-0", current.dot)} />
          <span className="hidden sm:inline">{current.label}</span>
          {current.icon}
        </>
      )}
    </button>
  );

  return (
    <>
      {!dialogOnly && (
        isMenuItemTrigger ? (
          triggerButton
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{current.label} — click to configure</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="size-4" />
              Connect AI Agent (OpenCode)
            </DialogTitle>
            <DialogDescription>
              Connect to a local OpenCode server or a remote HTTPS OpenCode endpoint.
              No API keys are sent to Superr's servers.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Setup instructions for new users */}
            {status === "not-configured" && (
              <div className="rounded-lg border border-dashed bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-medium">First time? Install the agent:</p>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Download and run the installer script below</li>
                  <li>The script prints a <strong>Server URL</strong> and <strong>Auth Token</strong></li>
                  <li>Paste them here and click Connect</li>
                </ol>
                <a
                  download="install-superr-ai.sh"
                  href="/install-superr-ai.sh"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Download className="size-3.5" />
                  Download Installer (macOS / Linux)
                </a>
                <p className="text-xs text-muted-foreground">
                  Then run:{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                    chmod +x install-superr-ai.sh && ./install-superr-ai.sh
                  </code>
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="opencode-url">Server URL</Label>
                <Input
                  id="opencode-url"
                  placeholder="http://localhost:4096 or https://your-opencode-host"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opencode-token">Auth Token</Label>
                <Input
                  id="opencode-token"
                  type="password"
                  placeholder="Paste the token from the installer output"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            {status === "connected" && (
              <p className="flex items-center gap-1.5 text-sm text-emerald-600">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Connected to OpenCode server
              </p>
            )}

            {status === "disconnected" && (
              <div className="rounded-md bg-yellow-500/10 px-3 py-2 space-y-1">
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                  Server not reachable
                </p>
                <p className="text-xs text-muted-foreground">
                  For local development, make sure OpenCode is running:{" "}
                  <code className="rounded bg-muted px-1 font-mono text-xs">
                    opencode --headless --port 4096
                  </code>
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ExternalLink className="size-3" />
              <a
                href="https://opencode.ai/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                OpenCode documentation
              </a>
            </p>
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between">
            <div>
              {getConnectionConfig() && (
                <Button variant="ghost" size="sm" onClick={handleDisconnect} className="text-destructive hover:text-destructive">
                  Disconnect
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Connect
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
