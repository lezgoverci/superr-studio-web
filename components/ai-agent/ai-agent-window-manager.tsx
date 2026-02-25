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
} from "@/lib/ai-agent/window-state";

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
  const [hydrated, setHydrated] = useState(false);

  const isAppRoute = pathname.startsWith("/app");
  const isAgentRoute = pathname === "/app/agent";

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
    if (!(hydrated && isAppRoute && !isAgentRoute)) {
      return;
    }

    setWindowState((previous) => {
      const shouldUpdateContext =
        previous.activeContextKey !== pageContext.contextKey ||
        !areContextsEquivalent(previous.activeContext, pageContext);
      const shouldUpdateOrigin = previous.originPath !== pathname;

      if (!(shouldUpdateContext || shouldUpdateOrigin)) {
        return previous;
      }

      return {
        ...previous,
        originPath: pathname,
        activeContextKey: pageContext.contextKey,
        activeContext: pageContext,
      };
    });
  }, [
    hydrated,
    isAgentRoute,
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
        !isAgentRoute
      )
    ) {
      return;
    }
    router.push("/app/agent");
  }, [
    hydrated,
    isAgentRoute,
    isAppRoute,
    router,
    windowState.isOpen,
    windowState.mode,
  ]);

  useEffect(() => {
    if (!(hydrated && isAgentRoute)) {
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
  }, [hydrated, isAgentRoute, setWindowState]);

  const activeContext = useMemo(() => {
    if (isAgentRoute) {
      return windowState.activeContext ?? pageContext;
    }
    return pageContext;
  }, [isAgentRoute, pageContext, windowState.activeContext]);

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
    }));

    if (isAgentRoute) {
      router.replace(windowState.originPath || "/app");
    }
  }, [isAgentRoute, router, setWindowState, windowState.originPath]);

  const handleOpenSidebar = useCallback(() => {
    setWindowState((previous) => ({
      ...previous,
      mode: "sidebar",
      isOpen: true,
    }));

    if (isAgentRoute) {
      router.replace(windowState.originPath || "/app");
    }
  }, [isAgentRoute, router, setWindowState, windowState.originPath]);

  const handleOpenFullpage = useCallback(() => {
    setWindowState((previous) => ({
      ...previous,
      mode: "fullpage",
      isOpen: true,
      originPath: isAgentRoute ? previous.originPath : pathname,
      activeContext: isAgentRoute ? previous.activeContext : pageContext,
      activeContextKey: isAgentRoute
        ? previous.activeContextKey
        : pageContext.contextKey,
    }));

    if (!isAgentRoute) {
      router.push("/app/agent");
    }
  }, [isAgentRoute, pageContext, pathname, router, setWindowState]);

  if (!(hydrated && isAppRoute && windowState.isOpen)) {
    return null;
  }

  return (
    <>
      {windowState.mode === "sidebar" && !isAgentRoute ? (
        <div className="pointer-events-auto fixed inset-y-0 right-0 z-40 w-full max-w-[520px] border-l bg-background shadow-2xl md:top-14 md:bottom-0">
          <AIAgentWindowContent
            initialSessionId={activeSessionId}
            mode="sidebar"
            onMinimize={handleMinimize}
            onOpenFullpage={handleOpenFullpage}
            onOpenSidebar={handleOpenSidebar}
            onSessionLinked={handleSessionLinked}
            pageContext={activeContext}
          />
        </div>
      ) : null}

      {windowState.mode === "minimized" && !isAgentRoute ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] md:bottom-4 md:px-4 md:pb-0">
          <div className="pointer-events-auto h-[68dvh] w-full max-w-none overflow-hidden rounded-2xl border bg-background shadow-2xl md:h-[560px] md:max-h-[calc(100dvh-7rem)] md:max-w-[760px]">
            <AIAgentWindowContent
              className="h-full"
              initialSessionId={activeSessionId}
              mode="minimized"
              onMinimize={handleMinimize}
              onOpenFullpage={handleOpenFullpage}
              onOpenSidebar={handleOpenSidebar}
              onSessionLinked={handleSessionLinked}
              pageContext={activeContext}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
