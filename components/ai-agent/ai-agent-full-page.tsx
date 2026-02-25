"use client";

import { useAtom, useSetAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { AIAgentWindowContent } from "@/components/ai-agent/ai-agent-window-content";
import { useAiAgentPageContext } from "@/lib/ai-agent/page-context/use-ai-agent-page-context";
import {
  aiAgentWindowStateAtom,
  setAiAgentSessionForContextAtom,
} from "@/lib/ai-agent/window-state";

export function AIAgentFullPage() {
  const router = useRouter();
  const routeContext = useAiAgentPageContext();
  const [windowState, setWindowState] = useAtom(aiAgentWindowStateAtom);
  const setSessionForContext = useSetAtom(setAiAgentSessionForContextAtom);

  useEffect(() => {
    setWindowState((previous) => ({
      ...previous,
      mode: "fullpage",
      isOpen: true,
    }));
  }, [setWindowState]);

  const activeContext = useMemo(
    () => windowState.activeContext ?? routeContext,
    [routeContext, windowState.activeContext]
  );
  const activeContextKey = activeContext?.contextKey ?? null;
  const activeSessionId =
    activeContextKey && windowState.sessionByContextKey[activeContextKey]
      ? windowState.sessionByContextKey[activeContextKey]
      : null;

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
        className="h-full"
        initialSessionId={activeSessionId}
        mode="fullpage"
        onMinimize={handleMinimize}
        onOpenFullpage={handleOpenFullpage}
        onSessionLinked={handleSessionLinked}
        pageContext={activeContext}
      />
    </main>
  );
}
