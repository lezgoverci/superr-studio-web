"use client";

import { useAtom, useSetAtom } from "jotai";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { AIAgentWindowContent } from "@/components/ai-agent/ai-agent-window-content";
import { useAiAgentPageContext } from "@/lib/ai-agent/page-context/use-ai-agent-page-context";
import {
  aiAgentWindowStateAtom,
  setAiAgentSessionForContextAtom,
} from "@/lib/ai-agent/window-state";

export function AIAgentFullPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeContext = useAiAgentPageContext();
  const [windowState, setWindowState] = useAtom(aiAgentWindowStateAtom);
  const setSessionForContext = useSetAtom(setAiAgentSessionForContextAtom);
  const shouldStartEmpty = searchParams.get("chatStart") === "empty";

  useEffect(() => {
    setWindowState((previous) => ({
      ...previous,
      mode: "fullpage",
      isOpen: true,
    }));
  }, [setWindowState]);

  const activeContext = useMemo(() => {
    if (shouldStartEmpty) {
      return routeContext;
    }
    return windowState.activeContext ?? routeContext;
  }, [routeContext, shouldStartEmpty, windowState.activeContext]);
  const activeContextKey = activeContext?.contextKey ?? null;
  const persistedSessionId = activeContextKey
    ? (windowState.sessionByContextKey[activeContextKey] ?? null)
    : null;
  const initialSessionId = shouldStartEmpty ? null : persistedSessionId;

  const handleSessionLinked = useCallback(
    (sessionId: string) => {
      if (!activeContextKey) {
        return;
      }
      setSessionForContext({
        contextKey: activeContextKey,
        sessionId,
      });
    },
    [activeContextKey, setSessionForContext]
  );

  const handleMinimize = useCallback(() => {
    setWindowState((previous) => ({
      ...previous,
      mode: "minimized",
      isOpen: true,
      minimizedView: "input-only",
    }));
    router.replace(windowState.originPath || "/app");
  }, [router, setWindowState, windowState.originPath]);

  const handleOpenFullpage = useCallback(() => {
    setWindowState((previous) => ({
      ...previous,
      mode: "fullpage",
      isOpen: true,
    }));
  }, [setWindowState]);

  return (
    <main className="pointer-events-auto h-full w-full overflow-hidden">
      <AIAgentWindowContent
        autoSelectFirstSessionOnConnect={!shouldStartEmpty}
        className="h-full"
        initialSessionId={initialSessionId}
        mode="fullpage"
        onMinimize={handleMinimize}
        onOpenFullpage={handleOpenFullpage}
        onSessionLinked={handleSessionLinked}
        pageContext={activeContext}
      />
    </main>
  );
}
