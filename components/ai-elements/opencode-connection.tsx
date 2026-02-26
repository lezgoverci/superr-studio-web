"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useOpencode,
  type OpencodeConnectFailureReason,
} from "@/hooks/use-opencode";
import { getConnectionConfig, pingOpenCodeWithRetry } from "@/lib/opencode-client";
import { cn } from "@/lib/utils";
import { Loader2, Server, ServerOff, Unplug } from "lucide-react";
import { useOpenCodeConnection } from "@/components/ai-elements/opencode-provider";

type OpenCodeConnectionTriggerVariant = "default" | "menu-item";

type OpenCodeConnectionProps = {
  onStatusChange?: (connected: boolean) => void;
  className?: string;
  triggerVariant?: OpenCodeConnectionTriggerVariant;
  onTriggerClick?: () => void;
};

function getConnectFailureMessage(
  reason: OpencodeConnectFailureReason,
  error?: string
): string {
  if (reason === "bridge_unavailable") {
    return "Desktop bridge is not running. Start superr-bridge and retry.";
  }
  if (reason === "not_installed") {
    return "Agent is not installed locally. Install it from the desktop bridge.";
  }
  if (reason === "missing_config") {
    return "Desktop bridge did not provide connection details.";
  }
  if (reason === "start_failed") {
    return error || "Failed to start local Agent server.";
  }
  if (reason === "ping_failed") {
    return "Agent started but is not reachable yet. Please retry.";
  }
  return error || "Failed to connect to local AI Agent.";
}

export function OpenCodeConnection({
  onStatusChange,
  className,
  triggerVariant = "default",
  onTriggerClick,
}: OpenCodeConnectionProps) {
  const { connectViaDaemon, isLoading: bridgeLoading } = useOpencode();
  const { status, updateConnectionConfig, connected, verifyConnection } = useOpenCodeConnection();
  const [actionLoading, setActionLoading] = useState(false);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  // Sync the external callback whenever our global "connected" flag changes
  useEffect(() => {
    onStatusChangeRef.current?.(connected);
  }, [connected]);

  const handleConnect = useCallback(async () => {
    onTriggerClick?.();
    if (actionLoading || bridgeLoading) {
      return;
    }

    setActionLoading(true);
    try {
      const result = await connectViaDaemon();
      if (result.connected) {
        // Force the provider to re-check its connection status and get new config
        updateConnectionConfig(result.config);
        toast.success(
          result.startedOpencode
            ? "Local AI Agent started and connected."
            : "Connected to local AI Agent."
        );
        return;
      }

      void verifyConnection(); // Run verify to switch state if necessary
      toast.error(getConnectFailureMessage(result.reason, result.error));
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, bridgeLoading, connectViaDaemon, onTriggerClick]);

  const statusConfig = {
    checking: {
      icon: <Loader2 className="size-2.5 animate-spin text-muted-foreground" />,
      label: "Checking...",
      dot: "bg-muted-foreground",
    },
    connected: {
      icon: <Server className="size-2.5 text-emerald-500" />,
      label: "AI Agent connected",
      dot: "bg-emerald-500",
    },
    disconnected: {
      icon: <ServerOff className="size-2.5 text-destructive" />,
      label: "AI Agent offline",
      dot: "bg-destructive",
    },
    "not-configured": {
      icon: <Unplug className="size-2.5 text-muted-foreground" />,
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
  const isBusy = actionLoading || bridgeLoading;

  if (isMenuItemTrigger) {
    return (
      <button
        className={cn(
          "focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none",
          className
        )}
        disabled={isBusy}
        onClick={() => {
          void handleConnect();
        }}
        type="button"
      >
        <span className={cn("size-2 rounded-full shrink-0", current.dot)} />
        <span className="flex-1 text-left">Connect Agent</span>
        <span className="text-muted-foreground text-xs">{compactStatusLabel}</span>
        {isBusy ? <Loader2 className="size-3 animate-spin" /> : null}
      </button>
    );
  }

  return (
    <button
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
      disabled={isBusy}
      onClick={() => {
        void handleConnect();
      }}
      type="button"
    >
      <span className={cn("size-1.5 rounded-full flex-shrink-0", current.dot)} />
      <span className="hidden sm:inline">{current.label}</span>
      {isBusy ? <Loader2 className="size-2.5 animate-spin" /> : current.icon}
    </button>
  );
}
