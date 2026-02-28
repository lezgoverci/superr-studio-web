"use client";

import {
  Check,
  ChevronRight,
  Loader2,
  Plus,
  Server,
  ServerOff,
  Settings,
  Unplug,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useOpenCodeConnection } from "@/components/ai-elements/opencode-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type SavedConnection = {
  id: string;
  name: string | null;
  url: string;
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// Standalone status button (e.g. for toolbars / headers)
// ---------------------------------------------------------------------------

type OpenCodeConnectionProps = {
  onStatusChange?: (connected: boolean) => void;
  className?: string;
  showServerName?: boolean;
};

export function OpenCodeConnection({
  onStatusChange,
  className,
  showServerName = false,
}: OpenCodeConnectionProps) {
  const router = useRouter();
  const { status, connected, connectionConfig } = useOpenCodeConnection();
  const onStatusChangeRef = useRef(onStatusChange);
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [switchingServer, setSwitchingServer] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { verifyConnection } = useOpenCodeConnection();

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onStatusChangeRef.current?.(connected);
  }, [connected]);

  const loadConnections = useCallback(async () => {
    setLoadingConnections(true);
    try {
      const response = await api.opencode.getConnection();
      if (response.configured && response.connections) {
        setConnections(response.connections);
      } else {
        setConnections([]);
      }
    } catch (error) {
      console.error("Failed to load connections:", error);
      setConnections([]);
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  useEffect(() => {
    if (menuOpen) {
      loadConnections();
    }
  }, [menuOpen, loadConnections]);

  const handleSwitchServer = useCallback(
    async (connectionId: string) => {
      if (switchingServer) return;
      setSwitchingServer(connectionId);
      try {
        await api.opencode.activateConnection(connectionId);
        await verifyConnection();
        const response = await api.opencode.getConnection();
        if (response.configured && response.connections) {
          setConnections(response.connections);
        }
        toast.success("Switched to different server");
      } catch (error) {
        console.error("Failed to switch server:", error);
        toast.error(
          error instanceof ApiError ? error.message : "Failed to switch server",
        );
      } finally {
        setSwitchingServer(null);
      }
    },
    [switchingServer, verifyConnection],
  );

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
  const activeConnection = connections.find((c) => c.isActive);

  const displayLabel =
    showServerName && activeConnection
      ? activeConnection.name || activeConnection.url
      : current.label;

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            className,
          )}
          type="button"
        >
          <span
            className={cn("size-1.5 rounded-full flex-shrink-0", current.dot)}
          />
          {showServerName && status === "connected" && activeConnection ? (
            <span className="hidden sm:inline truncate max-w-[120px]">
              {activeConnection.name || activeConnection.url}
            </span>
          ) : (
            <span className="hidden sm:inline">{displayLabel}</span>
          )}
          {current.icon}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <span
            className={cn("size-1.5 rounded-full flex-shrink-0", current.dot)}
          />
          <span className="truncate">
            {status === "connected"
              ? "Connected"
              : status === "disconnected"
                ? "Offline"
                : status === "not-configured"
                  ? "Not set up"
                  : "Checking..."}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loadingConnections ? (
          <DropdownMenuItem disabled>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading servers...
          </DropdownMenuItem>
        ) : connections.length > 0 ? (
          connections.map((conn) => (
            <DropdownMenuItem
              key={conn.id}
              disabled={switchingServer !== null}
              onSelect={() => {
                if (!conn.isActive) {
                  void handleSwitchServer(conn.id);
                }
              }}
            >
              {conn.isActive ? (
                <Check className="mr-2 size-4 text-emerald-500" />
              ) : switchingServer === conn.id ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Server className="mr-2 size-4 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">{conn.name || conn.url}</span>
            </DropdownMenuItem>
          ))
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            router.push("/app/settings?tab=agent-server");
          }}
        >
          <Plus className="mr-2 size-4" />
          Add Server
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            router.push("/app/settings?tab=agent-server");
          }}
        >
          <Settings className="mr-2 size-4" />
          Server Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Inline menu items — rendered directly inside a parent DropdownMenuContent
// ---------------------------------------------------------------------------

type OpenCodeConnectionMenuItemsProps = {
  onStatusChange?: (connected: boolean) => void;
};

export function OpenCodeConnectionMenuItems({
  onStatusChange,
}: OpenCodeConnectionMenuItemsProps) {
  const router = useRouter();
  const { status, connected, verifyConnection } = useOpenCodeConnection();
  const onStatusChangeRef = useRef(onStatusChange);
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [switchingServer, setSwitchingServer] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onStatusChangeRef.current?.(connected);
  }, [connected]);

  // Load connections once when mounted (the parent menu opens)
  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    setLoadingConnections(true);
    api.opencode
      .getConnection()
      .then((response) => {
        if (response.configured && response.connections) {
          setConnections(response.connections);
        } else {
          setConnections([]);
        }
      })
      .catch((error) => {
        console.error("Failed to load connections:", error);
        setConnections([]);
      })
      .finally(() => {
        setLoadingConnections(false);
      });
  }, [loaded]);

  const handleSwitchServer = useCallback(
    async (connectionId: string) => {
      if (switchingServer) return;
      setSwitchingServer(connectionId);
      try {
        await api.opencode.activateConnection(connectionId);
        await verifyConnection();
        const response = await api.opencode.getConnection();
        if (response.configured && response.connections) {
          setConnections(response.connections);
        }
        toast.success("Switched to different server");
      } catch (error) {
        console.error("Failed to switch server:", error);
        toast.error(
          error instanceof ApiError ? error.message : "Failed to switch server",
        );
      } finally {
        setSwitchingServer(null);
      }
    },
    [switchingServer, verifyConnection],
  );

  const statusDot =
    status === "connected"
      ? "bg-emerald-500"
      : status === "disconnected"
        ? "bg-destructive"
        : "bg-muted-foreground";

  const statusLabel =
    status === "connected"
      ? "Connected"
      : status === "disconnected"
        ? "Offline"
        : status === "not-configured"
          ? "Not configured"
          : "Checking...";

  return (
    <>
      {/* Section label with connection status */}
      <DropdownMenuLabel className="flex items-center gap-2 text-xs">
        <span
          className={cn("size-1.5 rounded-full flex-shrink-0", statusDot)}
        />
        Agent Server
        <span className="ml-auto text-[10px] font-normal text-muted-foreground">
          {statusLabel}
        </span>
      </DropdownMenuLabel>

      {/* Server list */}
      {loadingConnections ? (
        <DropdownMenuItem disabled>
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading...
        </DropdownMenuItem>
      ) : connections.length > 0 ? (
        connections.map((conn) => (
          <DropdownMenuItem
            key={conn.id}
            disabled={switchingServer !== null}
            onSelect={(e) => {
              if (conn.isActive) {
                e.preventDefault();
                return;
              }
              e.preventDefault();
              void handleSwitchServer(conn.id);
            }}
          >
            {conn.isActive ? (
              <Check className="mr-2 size-4 text-emerald-500" />
            ) : switchingServer === conn.id ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Server className="mr-2 size-4 text-muted-foreground" />
            )}
            <span className="flex-1 truncate">{conn.name || conn.url}</span>
          </DropdownMenuItem>
        ))
      ) : null}

      {/* Actions */}
      <DropdownMenuItem
        onSelect={() => {
          router.push("/app/settings?tab=agent-server");
        }}
      >
        <Plus className="mr-2 size-4" />
        Add Server
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          router.push("/app/settings?tab=agent-server");
        }}
      >
        <Settings className="mr-2 size-4" />
        Server Settings
      </DropdownMenuItem>
    </>
  );
}
