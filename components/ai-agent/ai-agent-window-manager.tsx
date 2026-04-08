"use client";

import { useAtom, useSetAtom } from "jotai";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AIAgentWindowContent } from "@/components/ai-agent/ai-agent-window-content";
import { useAiAgentPageContext } from "@/lib/ai-agent/page-context/use-ai-agent-page-context";
import {
  aiAgentWindowStateAtom,
  hydrateAiAgentWindowStateAtom,
  loadAiAgentWindowStateFromStorage,
  saveAiAgentWindowStateToStorage,
  setAiAgentSessionForContextAtom,
  setLastActiveSessionAtom,
} from "@/lib/ai-agent/window-state";
import {
  getAssistantReturnPath,
  isAssistantRoute,
  isWorkflowChatEligibleRoute,
} from "@/lib/app-route-utils";
import { cn } from "@/lib/utils";

function areContextsEquivalent(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function AIAgentWindowManager() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const pageContext = useAiAgentPageContext();
  const [windowState, setWindowState] = useAtom(aiAgentWindowStateAtom);
  const hydrateWindowState = useSetAtom(hydrateAiAgentWindowStateAtom);
  const setSessionForContext = useSetAtom(setAiAgentSessionForContextAtom);
  const setLastActiveSession = useSetAtom(setLastActiveSessionAtom);
  const [hydrated, setHydrated] = useState(false);

  const isAppRoute = pathname.startsWith("/app");
  const isAssistantFullPageRoute = isAssistantRoute(pathname);
  const shouldRenderMinimizedChat = isWorkflowChatEligibleRoute(pathname);

  useEffect(() => {
    hydrateWindowState(loadAiAgentWindowStateFromStorage());
    setHydrated(true);
  }, [hydrateWindowState]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    saveAiAgentWindowStateToStorage(windowState);
  }, [hydrated, windowState]);

  useEffect(() => {
    if (!(hydrated && isAppRoute && !isAssistantFullPageRoute)) {
      return;
    }

    setWindowState((previous) => {
      const shouldUpdateContext =
        previous.activeContextKey !== pageContext.contextKey ||
        !areContextsEquivalent(previous.activeContext, pageContext);
      const shouldUpdateOrigin =
        isWorkflowChatEligibleRoute(pathname) &&
        previous.originPath !== pathname;

      if (!(shouldUpdateContext || shouldUpdateOrigin)) {
        return previous;
      }

      return {
        ...previous,
        originPath: shouldUpdateOrigin ? pathname : previous.originPath,
        activeContextKey: pageContext.contextKey,
        activeContext: pageContext,
      };
    });
  }, [
    hydrated,
    isAssistantFullPageRoute,
    isAppRoute,
    pageContext,
    pathname,
    setWindowState,
  ]);

  useEffect(() => {
    if (
      !(
        hydrated &&
        isAppRoute &&
        windowState.isOpen &&
        windowState.mode === "fullpage" &&
        !isAssistantFullPageRoute
      )
    ) {
      return;
    }

    setWindowState((previous) => {
      if (!(previous.isOpen && previous.mode === "fullpage")) {
        return previous;
      }

      return {
        ...previous,
        mode: "minimized",
        isOpen: true,
      };
    });
  }, [
    hydrated,
    isAssistantFullPageRoute,
    isAppRoute,
    setWindowState,
    windowState.isOpen,
    windowState.mode,
  ]);

  useEffect(() => {
    if (!(hydrated && isAssistantFullPageRoute)) {
      return;
    }

    setWindowState((previous) => {
      if (previous.mode === "fullpage" && previous.isOpen) {
        return previous;
      }
      return {
        ...previous,
        mode: "fullpage",
        isOpen: true,
      };
    });
  }, [hydrated, isAssistantFullPageRoute, setWindowState]);

  const activeContext = useMemo(() => {
    if (isAssistantFullPageRoute) {
      return windowState.activeContext ?? pageContext;
    }
    return pageContext;
  }, [isAssistantFullPageRoute, pageContext, windowState.activeContext]);

  const activeContextKey = activeContext?.contextKey ?? null;
  const activeSessionId =
    activeContextKey && windowState.sessionByContextKey[activeContextKey]
      ? windowState.sessionByContextKey[activeContextKey]
      : (windowState.lastActiveSessionId ?? null);

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

  const handleActiveSessionChange = useCallback(
    (sessionId: string | null) => {
      setLastActiveSession(sessionId);
    },
    [setLastActiveSession]
  );

  const handleMinimize = useCallback(() => {
    setWindowState((previous) => ({
      ...previous,
      mode: "minimized",
      isOpen: true,
      minimizedView: "input-only",
    }));

    if (isAssistantFullPageRoute) {
      router.replace(getAssistantReturnPath(windowState.originPath));
    }
  }, [
    isAssistantFullPageRoute,
    router,
    setWindowState,
    windowState.originPath,
  ]);

  const handleOpenFullpage = useCallback(() => {
    setWindowState((previous) => ({
      ...previous,
      mode: "fullpage",
      isOpen: true,
      originPath: isAssistantFullPageRoute ? previous.originPath : pathname,
      activeContext: isAssistantFullPageRoute
        ? previous.activeContext
        : pageContext,
      activeContextKey: isAssistantFullPageRoute
        ? previous.activeContextKey
        : pageContext.contextKey,
    }));

    if (!isAssistantFullPageRoute) {
      router.push("/app/assistant");
    }
  }, [isAssistantFullPageRoute, pageContext, pathname, router, setWindowState]);

  const handleToggleMinimizedView = useCallback(() => {
    setWindowState((previous) => ({
      ...previous,
      minimizedView:
        previous.minimizedView === "input-only" ? "thread" : "input-only",
    }));
  }, [setWindowState]);

  if (!(hydrated && isAppRoute && windowState.isOpen)) {
    return null;
  }

  return (
    <>
      {windowState.mode === "minimized" &&
      !isAssistantFullPageRoute &&
      shouldRenderMinimizedChat ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] md:bottom-4 md:px-4 md:pb-0">
          <div
            className={cn(
              "pointer-events-auto w-full max-w-none overflow-hidden rounded-2xl border bg-background shadow-2xl md:max-w-[760px]",
              windowState.minimizedView === "input-only"
                ? "h-auto"
                : "h-[68dvh] md:h-[560px] md:max-h-[calc(100dvh-7rem)]"
            )}
          >
            <AIAgentWindowContent
              className={
                windowState.minimizedView === "input-only"
                  ? undefined
                  : "h-full"
              }
              initialSessionId={activeSessionId}
              minimizedView={windowState.minimizedView}
              mode="minimized"
              onActiveSessionChange={handleActiveSessionChange}
              onMinimize={handleMinimize}
              onOpenFullpage={handleOpenFullpage}
              onSessionLinked={handleSessionLinked}
              onToggleMinimizedView={handleToggleMinimizedView}
              pageContext={activeContext}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
