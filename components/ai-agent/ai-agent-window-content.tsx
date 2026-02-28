"use client";

import { AIAgentChat } from "@/components/ai-elements/opencode-chat";
import type { AiAgentContextEnvelope } from "@/lib/ai-agent/page-context/types";
import type { AiAgentMinimizedView } from "@/lib/ai-agent/window-state";
import { cn } from "@/lib/utils";

type AiAgentWindowContentProps = {
  className?: string;
  mode: "minimized" | "fullpage";
  pageContext: AiAgentContextEnvelope | null;
  initialSessionId?: string | null;
  autoSelectFirstSessionOnConnect?: boolean;
  minimizedView?: AiAgentMinimizedView;
  onSessionLinked: (sessionId: string) => void;
  onActiveSessionChange?: (sessionId: string | null) => void;
  onMinimize: () => void;
  onOpenFullpage: () => void;
  onToggleMinimizedView?: () => void;
};

export function AIAgentWindowContent({
  className,
  mode,
  pageContext,
  initialSessionId,
  autoSelectFirstSessionOnConnect,
  minimizedView = "input-only",
  onSessionLinked,
  onActiveSessionChange,
  onMinimize,
  onOpenFullpage,
  onToggleMinimizedView,
}: AiAgentWindowContentProps) {
  const isMinimized = mode === "minimized";
  const isInputOnlyMinimized = isMinimized && minimizedView === "input-only";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-background",
        !isInputOnlyMinimized && "h-full",
        className
      )}
    >
      <div className="min-h-0 flex-1">
        <AIAgentChat
          autoSelectFirstSessionOnConnect={autoSelectFirstSessionOnConnect}
          className={isInputOnlyMinimized ? undefined : "h-full"}
          initialSessionId={initialSessionId}
          minimizedDisplayMode={isMinimized ? minimizedView : "thread"}
          onActiveSessionChange={onActiveSessionChange}
          onSessionLinked={onSessionLinked}
          pageContext={pageContext}
          uiVariant={isMinimized ? "minimized" : "default"}
          windowControls={{
            mode,
            onMinimize,
            onOpenFullpage,
            onToggleMinimizedView,
          }}
        />
      </div>
    </div>
  );
}
