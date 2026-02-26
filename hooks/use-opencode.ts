import { useCallback, useEffect, useState } from "react";
import {
  pingOpenCodeWithRetry,
  saveConnectionConfig,
} from "@/lib/opencode-client";

const BRIDGE_PORT = 31_256;
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;

export type OpencodeStatus =
  | "unknown"
  | "not_installed"
  | "stopped"
  | "running";

export type DaemonConfig = {
  url: string;
  username: string;
  token: string;
  port: number;
};

type BridgeStatusSnapshot = {
  isBridgeRunning: boolean;
  status: OpencodeStatus;
  config: DaemonConfig | null;
};

type CheckStatusOptions = {
  silent?: boolean;
};

export type OpencodeConnectFailureReason =
  | "bridge_unavailable"
  | "not_installed"
  | "missing_config"
  | "start_failed"
  | "ping_failed"
  | "unknown";

export type OpencodeConnectResult =
  | {
      connected: true;
      startedOpencode: boolean;
      config: DaemonConfig;
    }
  | {
      connected: false;
      reason: OpencodeConnectFailureReason;
      error?: string;
    };

function getConnectionFromDaemonConfig(config: DaemonConfig) {
  return {
    url: `http://localhost:${config.port}`,
    token: config.token,
    username: config.username,
  };
}

export function useOpencode() {
  const [status, setStatus] = useState<OpencodeStatus>("unknown");
  const [isBridgeRunning, setIsBridgeRunning] = useState<boolean>(true); // Assume it is, then verify it's not
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<DaemonConfig | null>(null);

  const checkStatus = useCallback(
    async (options: CheckStatusOptions = {}): Promise<BridgeStatusSnapshot> => {
      const { silent = false } = options;
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await fetch(`${BRIDGE_URL}/status`, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Bridge responded with ${response.status}`);
        }

        const data = (await response.json()) as {
          config?: DaemonConfig | null;
          opencode_installed?: boolean;
          opencode_running?: boolean;
        };
        const nextConfig = data.config ? (data.config as DaemonConfig) : null;
        const nextStatus: OpencodeStatus =
          data.opencode_installed === false
            ? "not_installed"
            : data.opencode_running
              ? "running"
              : "stopped";

        setIsBridgeRunning(true);
        setConfig(nextConfig);
        setStatus(nextStatus);

        return {
          isBridgeRunning: true,
          status: nextStatus,
          config: nextConfig,
        };
      } catch {
        setIsBridgeRunning(false);
        setStatus("unknown");
        setConfig(null);
        if (!silent) {
          setError("Bridge not running");
        }
        return {
          isBridgeRunning: false,
          status: "unknown",
          config: null,
        };
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  const installOpencode = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BRIDGE_URL}/install`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Install failed with ${response.status}`
        );
      }

      await checkStatus({ silent: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [checkStatus]);

  const startOpencode = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BRIDGE_URL}/start`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Start failed with ${response.status}`
        );
      }

      await checkStatus({ silent: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [checkStatus]);

  const stopOpencode = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BRIDGE_URL}/stop`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Stop failed with ${response.status}`
        );
      }

      await checkStatus({ silent: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [checkStatus]);

  const connectViaDaemon =
    useCallback(async (): Promise<OpencodeConnectResult> => {
      setIsLoading(true);
      setError(null);

      try {
        let snapshot = await checkStatus({ silent: true });
        if (!snapshot.isBridgeRunning) {
          return { connected: false, reason: "bridge_unavailable" };
        }

        if (snapshot.status === "not_installed") {
          return { connected: false, reason: "not_installed" };
        }

        let startedOpencode = false;

        if (snapshot.status !== "running") {
          startedOpencode = true;
          const startResponse = await fetch(`${BRIDGE_URL}/start`, {
            method: "POST",
          });
          if (!startResponse.ok) {
            const errorData = await startResponse.json().catch(() => ({}));
            return {
              connected: false,
              reason: "start_failed",
              error:
                errorData.error || `Start failed with ${startResponse.status}`,
            };
          }

          snapshot = await checkStatus({ silent: true });
        }

        if (!(snapshot.isBridgeRunning && snapshot.config)) {
          return { connected: false, reason: "missing_config" };
        }

        const daemonConnection = getConnectionFromDaemonConfig(snapshot.config);
        saveConnectionConfig(daemonConnection);
        const ok = await pingOpenCodeWithRetry(10, 400);
        if (!ok) {
          return { connected: false, reason: "ping_failed" };
        }

        await checkStatus({ silent: true });
        return {
          connected: true,
          startedOpencode,
          config: snapshot.config,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          connected: false,
          reason: "unknown",
          error: message,
        };
      } finally {
        setIsLoading(false);
      }
    }, [checkStatus]);

  // Initial check
  useEffect(() => {
    void checkStatus();

    // Poll every 5 seconds to keep status updated
    const interval = setInterval(() => {
      void checkStatus({ silent: true });
    }, 5000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return {
    status,
    isBridgeRunning,
    isLoading,
    error,
    config,
    checkStatus,
    installOpencode,
    startOpencode,
    stopOpencode,
    connectViaDaemon,
  };
}
