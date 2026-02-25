"use client";

import { AIAgentChat } from "@/components/ai-elements/opencode-chat";
import type { AiAgentContextEnvelope } from "@/lib/ai-agent/page-context/types";
import type { AiAgentMinimizedView } from "@/lib/ai-agent/window-state";
import { cn } from "@/lib/utils";

type AiAgentWindowContentProps = {
  className?: string;
  mode: "minimized" | "sidebar" | "fullpage";
  pageContext: AiAgentContextEnvelope | null;
  initialSessionId?: string | null;
  minimizedView?: AiAgentMinimizedView;
  onSessionLinked: (sessionId: string) => void;
  onMinimize: () => void;
  onOpenSidebar: () => void;
  onOpenFullpage: () => void;
  onToggleMinimizedView?: () => void;
};

export function AIAgentWindowContent({
  className,
  mode,
  pageContext,
  initialSessionId,
  minimizedView = "input-only",
  onSessionLinked,
  onMinimize,
  onOpenSidebar,
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
          className={isInputOnlyMinimized ? undefined : "h-full"}
          initialSessionId={initialSessionId}
          minimizedDisplayMode={isMinimized ? minimizedView : "thread"}
          onSessionLinked={onSessionLinked}
          pageContext={pageContext}
          uiVariant={isMinimized ? "minimized" : "default"}
          windowControls={{
            mode,
            onMinimize,
            onOpenFullpage,
            onOpenSidebar,
            onToggleMinimizedView,
          }}
        />
      </div>
    </div>
  );
}
