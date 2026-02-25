"use client";

import {
  Maximize2,
  Minimize2,
  PanelRight,
  PanelRightClose,
} from "lucide-react";
import { AIAgentChat } from "@/components/ai-elements/opencode-chat";
import { Button } from "@/components/ui/button";
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

type AIAgentWindowHeaderProps = {
  mode: "minimized" | "sidebar" | "fullpage";
  summary: string;
  onMinimize: () => void;
  onOpenSidebar: () => void;
  onOpenFullpage: () => void;
  onToggleMinimizedView?: () => void;
  showInputOnlyState: boolean;
};

function AIAgentWindowHeader({
  mode,
  summary,
  onMinimize,
  onOpenSidebar,
  onOpenFullpage,
  onToggleMinimizedView,
  showInputOnlyState,
}: AIAgentWindowHeaderProps) {
  const isMinimized = mode === "minimized";
  const controlSize = isMinimized ? "size-6" : "size-7";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-b",
        isMinimized ? "px-2 py-1.5" : "px-3 py-2"
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-medium",
            isMinimized ? "text-xs" : "text-sm"
          )}
        >
          AI Agent
        </p>
        {isMinimized ? null : (
          <p className="truncate text-muted-foreground text-xs">{summary}</p>
        )}
      </div>

      {isMinimized ? (
        <Button
          aria-label={
            showInputOnlyState
              ? "Show conversation thread"
              : "Switch to input-only mode"
          }
          className="h-6 px-2 text-[11px]"
          disabled={!onToggleMinimizedView}
          onClick={() => onToggleMinimizedView?.()}
          size="sm"
          variant={showInputOnlyState ? "secondary" : "ghost"}
        >
          {showInputOnlyState ? "Show Thread" : "Input Only"}
        </Button>
      ) : null}

      <Button
        aria-label="Open sidebar mode"
        className={cn(controlSize)}
        disabled={mode === "sidebar"}
        onClick={onOpenSidebar}
        size="icon"
        variant="ghost"
      >
        {mode === "sidebar" ? (
          <PanelRightClose className="size-3.5" />
        ) : (
          <PanelRight className="size-3.5" />
        )}
      </Button>

      <Button
        aria-label="Open full page mode"
        className={cn(controlSize)}
        disabled={mode === "fullpage"}
        onClick={onOpenFullpage}
        size="icon"
        variant="ghost"
      >
        <Maximize2 className="size-3.5" />
      </Button>

      {isMinimized ? null : (
        <Button
          aria-label="Minimize AI Agent"
          className="size-7"
          onClick={onMinimize}
          size="icon"
          variant="ghost"
        >
          <Minimize2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

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
  const summary = pageContext?.summary || "Assistant context is ready.";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-background",
        !isInputOnlyMinimized && "h-full",
        className
      )}
    >
      <AIAgentWindowHeader
        mode={mode}
        onMinimize={onMinimize}
        onOpenFullpage={onOpenFullpage}
        onOpenSidebar={onOpenSidebar}
        onToggleMinimizedView={onToggleMinimizedView}
        showInputOnlyState={isInputOnlyMinimized}
        summary={summary}
      />

      <div className="min-h-0 flex-1">
        <AIAgentChat
          className={isInputOnlyMinimized ? undefined : "h-full"}
          initialSessionId={initialSessionId}
          minimizedDisplayMode={isMinimized ? minimizedView : "thread"}
          onSessionLinked={onSessionLinked}
          pageContext={pageContext}
          uiVariant={isMinimized ? "minimized" : "default"}
        />
      </div>
    </div>
  );
}
