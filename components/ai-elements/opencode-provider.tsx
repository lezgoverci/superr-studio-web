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

  const loadConnectionConfigFromServer =
    useCallback(async (): Promise<OpenCodeConnectionConfig | null> => {
      try {
        const response = await api.opencode.getConnection();
        if (!(response.configured && response.connection)) {
          clearConnectionConfig();
          setConnectionConfig(null);
          return null;
        }

        saveConnectionConfig({
          url: response.connection.url,
          username: response.connection.username,
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

  const verifyConnection = useCallback(async () => {
    if (isVerifyingRef.current) {
      return;
    }

    isVerifyingRef.current = true;

    try {
      if (status !== "connected") {
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
  }, [loadConnectionConfigFromServer, status]);

  useEffect(() => {
    verifyConnection().catch(() => {});

    const interval = setInterval(() => {
      verifyConnection().catch(() => {});
    }, 30_000);

    return () => clearInterval(interval);
  }, [verifyConnection]);

  const updateConnectionConfig = useCallback(
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
    [verifyConnection],
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
