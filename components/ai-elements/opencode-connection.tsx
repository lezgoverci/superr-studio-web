"use client";

import { Loader2, Server, ServerOff, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useOpenCodeConnection } from "@/components/ai-elements/opencode-provider";
import { cn } from "@/lib/utils";

type OpenCodeConnectionTriggerVariant = "default" | "menu-item";

type OpenCodeConnectionProps = {
  onStatusChange?: (connected: boolean) => void;
  className?: string;
  triggerVariant?: OpenCodeConnectionTriggerVariant;
  onTriggerClick?: () => void;
};

export function OpenCodeConnection({
  onStatusChange,
  className,
  triggerVariant = "default",
  onTriggerClick,
}: OpenCodeConnectionProps) {
  const router = useRouter();
  const { status, connected } = useOpenCodeConnection();
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onStatusChangeRef.current?.(connected);
  }, [connected]);

  const statusConfig = {
    checking: {
      icon: <Loader2 className="size-2.5 animate-spin text-muted-foreground" />,
      label: "Checking...",
      dot: "bg-muted-foreground",
    },
    connected: {
      icon: <Server className="size-2.5 text-emerald-500" />,
      label: "Agent server connected",
      dot: "bg-emerald-500",
    },
    disconnected: {
      icon: <ServerOff className="size-2.5 text-destructive" />,
      label: "Agent server offline",
      dot: "bg-destructive",
    },
    "not-configured": {
      icon: <Unplug className="size-2.5 text-muted-foreground" />,
      label: "Agent server not set up",
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

  const handleClick = () => {
    onTriggerClick?.();
    router.push("/app/settings?tab=agent-server");
  };

  if (isMenuItemTrigger) {
    return (
      <button
        className={cn(
          "focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none",
          className,
        )}
        onClick={handleClick}
        type="button"
      >
        <span className={cn("size-2 rounded-full shrink-0", current.dot)} />
        <span className="flex-1 text-left">Connect Agent</span>
        <span className="text-muted-foreground text-xs">
          {compactStatusLabel}
        </span>
      </button>
    );
  }

  return (
    <button
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
      onClick={handleClick}
      type="button"
    >
      <span
        className={cn("size-1.5 rounded-full flex-shrink-0", current.dot)}
      />
      <span className="hidden sm:inline">{current.label}</span>
      {current.icon}
    </button>
  );
}
