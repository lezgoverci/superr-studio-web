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
import { type OpenCodeConnectionConfig, getConnectionConfig, pingOpenCodeWithRetry } from "@/lib/opencode-client";

export type ConnectionStatus = "checking" | "connected" | "disconnected" | "not-configured";

type OpenCodeContextType = {
  status: ConnectionStatus;
  connected: boolean;
  connectionConfig: OpenCodeConnectionConfig | null;
  verifyConnection: () => Promise<void>;
  updateConnectionConfig: (config: OpenCodeConnectionConfig | null) => void;
};

const OpenCodeContext = createContext<OpenCodeContextType | undefined>(undefined);

export function OpenCodeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [connected, setConnected] = useState(false);
  const [connectionConfig, setConnectionConfig] = useState<OpenCodeConnectionConfig | null>(null);

  const isVerifyingRef = useRef(false);

  const verifyConnection = useCallback(async () => {
    if (isVerifyingRef.current) return;
    
    const config = getConnectionConfig();
    setConnectionConfig(config);

    if (!config) {
      setStatus("not-configured");
      setConnected(false);
      return;
    }

    isVerifyingRef.current = true;
    try {
      if (status !== "connected") {
        setStatus("checking");
      }
      
      const ok = await pingOpenCodeWithRetry(2, 200);
      
      const nextStatus: ConnectionStatus = ok ? "connected" : "disconnected";
      setStatus(nextStatus);
      setConnected(ok);
    } finally {
      isVerifyingRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    void verifyConnection();
    
    // Poll every 30 seconds
    const interval = setInterval(() => {
      void verifyConnection();
    }, 30_000);
    
    return () => clearInterval(interval);
  }, [verifyConnection]);

  // Use this when connection config changes (e.g. user connects/disconnects explicitly)
  const updateConnectionConfig = useCallback((config: OpenCodeConnectionConfig | null) => {
    setConnectionConfig(config);
    void verifyConnection();
  }, [verifyConnection]);

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
    throw new Error("useOpenCodeConnection must be used within an OpenCodeProvider");
  }
  return context;
}
