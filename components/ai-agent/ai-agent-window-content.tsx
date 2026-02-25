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
import { cn } from "@/lib/utils";

type AiAgentWindowContentProps = {
  className?: string;
  mode: "sidebar" | "fullpage";
  pageContext: AiAgentContextEnvelope | null;
  initialSessionId?: string | null;
  onSessionLinked: (sessionId: string) => void;
  onMinimize: () => void;
  onOpenSidebar: () => void;
  onOpenFullpage: () => void;
};

export function AIAgentWindowContent({
  className,
  mode,
  pageContext,
  initialSessionId,
  onSessionLinked,
  onMinimize,
  onOpenSidebar,
  onOpenFullpage,
}: AiAgentWindowContentProps) {
  return (
    <div
      className={cn("flex h-full min-h-0 flex-col bg-background", className)}
    >
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">AI Agent</p>
          <p className="truncate text-muted-foreground text-xs">
            {pageContext?.summary || "Assistant context is ready."}
          </p>
        </div>

        <Button
          aria-label="Open sidebar mode"
          className="size-7"
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
          className="size-7"
          disabled={mode === "fullpage"}
          onClick={onOpenFullpage}
          size="icon"
          variant="ghost"
        >
          <Maximize2 className="size-3.5" />
        </Button>

        <Button
          aria-label="Minimize AI Agent"
          className="size-7"
          onClick={onMinimize}
          size="icon"
          variant="ghost"
        >
          <Minimize2 className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <AIAgentChat
          className="h-full"
          initialSessionId={initialSessionId}
          onSessionLinked={onSessionLinked}
          pageContext={pageContext}
        />
      </div>
    </div>
  );
}
