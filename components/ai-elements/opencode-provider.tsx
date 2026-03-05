"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStableCallback } from "@/lib/use-stable-callback";
import { api } from "@/lib/api-client";
import {
  clearConnectionConfig,
  getConnectionConfig,
  pingOpenCodeWithRetry,
  saveConnectionConfig,
  type OpenCodeConnectionConfig,
} from "@/lib/opencode-client";

export type ConnectionStatus =
  | "checking"
  | "connected"
  | "disconnected"
  | "not-configured";

type OpenCodeContextType = {
  status: ConnectionStatus;
  connected: boolean;
  connectionConfig: OpenCodeConnectionConfig | null;
  verifyConnection: () => Promise<void>;
  updateConnectionConfig: (config: OpenCodeConnectionConfig | null) => void;
};

const OpenCodeContext = createContext<OpenCodeContextType | undefined>(
  undefined,
);

export function OpenCodeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [connected, setConnected] = useState(false);
  const [connectionConfig, setConnectionConfig] =
    useState<OpenCodeConnectionConfig | null>(null);
  const isVerifyingRef = useRef(false);
  const statusRef = useRef<ConnectionStatus>("checking");

  // Keep statusRef in sync so we can read current status without a dep.
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const loadConnectionConfigFromServer =
    useCallback(async (): Promise<OpenCodeConnectionConfig | null> => {
      try {
        const response = await api.opencode.getConnection();
        if (
          !response.configured ||
          !response.connections ||
          response.connections.length === 0
        ) {
          clearConnectionConfig();
          setConnectionConfig(null);
          return null;
        }

        const activeId = response.activeConnectionId;
        const activeConnection =
          response.connections.find((c) => c.id === activeId) ??
          response.connections[0];

        if (!activeConnection) {
          clearConnectionConfig();
          setConnectionConfig(null);
          return null;
        }

        saveConnectionConfig({
          url: activeConnection.url,
          username: activeConnection.username,
          ...(activeConnection.directory
            ? { directory: activeConnection.directory }
            : {}),
        });

        const config = getConnectionConfig();
        setConnectionConfig(config);
        return config;
      } catch {
        const cachedConfig = getConnectionConfig();
        setConnectionConfig(cachedConfig);
        return cachedConfig;
      }
    }, []);

  // verifyConnection is stable (no status dep) — reads status via ref.
  const verifyConnection = useCallback(async () => {
    if (isVerifyingRef.current) {
      return;
    }

    isVerifyingRef.current = true;

    try {
      if (statusRef.current !== "connected") {
        setStatus("checking");
      }

      const config = await loadConnectionConfigFromServer();
      if (!config) {
        setStatus("not-configured");
        setConnected(false);
        return;
      }

      const ok = await pingOpenCodeWithRetry(2, 200);
      setStatus(ok ? "connected" : "disconnected");
      setConnected(ok);
    } finally {
      isVerifyingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadConnectionConfigFromServer]);

  useEffect(() => {
    verifyConnection().catch(() => {});

    const interval = setInterval(() => {
      verifyConnection().catch(() => {});
    }, 30_000);

    return () => clearInterval(interval);
  }, [verifyConnection]);

  const updateConnectionConfig = useStableCallback(
    (config: OpenCodeConnectionConfig | null) => {
      if (config) {
        saveConnectionConfig(config);
        setConnectionConfig(getConnectionConfig());
      } else {
        clearConnectionConfig();
        setConnectionConfig(null);
      }

      verifyConnection().catch(() => {});
    },
  );

  return (
    <OpenCodeContext.Provider
      value={{
        status,
        connected,
        connectionConfig,
        verifyConnection,
        updateConnectionConfig,
      }}
    >
      {children}
    </OpenCodeContext.Provider>
  );
}

export function useOpenCodeConnection() {
  const context = useContext(OpenCodeContext);
  if (context === undefined) {
    throw new Error(
      "useOpenCodeConnection must be used within an OpenCodeProvider",
    );
  }
  return context;
}
