"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-sdk-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-sdk-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-sdk-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-sdk-elements/reasoning";
import {
  Suggestion,
  Suggestions,
} from "@/components/ai-sdk-elements/suggestion";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-sdk-elements/tool";
import { OpenCodeConnection } from "@/components/ai-elements/opencode-connection";
import { ProviderSettings } from "@/components/ai-elements/provider-settings";
import { Button } from "@/components/ui/button";
import { getConnectionConfig, getOpenCodeClient, type OpenCodeConnectionConfig } from "@/lib/opencode-client";
import { mapOpenCodeHistoryToUIMessages } from "@/lib/opencode-chat-adapter";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  Loader2,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";
import type { Session } from "@opencode-ai/sdk/client";

type OpenCodeChatProps = {
  className?: string;
};

const QUICK_SUGGESTIONS = [
  "Create a workflow that sends a Slack message when a webhook fires",
  "Explain what this workflow does",
  "Add an HTTP request step after the trigger",
] as const;

type SessionSidebarProps = {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
};

function SessionSidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: SessionSidebarProps) {
  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-muted-foreground text-xs font-medium">Sessions</span>
        <div className="flex items-center gap-1">
          <ProviderSettings />
          <Button className="size-6" onClick={onNew} size="icon" variant="ghost">
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.length === 0 && (
          <p className="px-3 py-4 text-center text-muted-foreground text-xs">
            No sessions yet
          </p>
        )}
        {sessions.map((session) => (
          <div
            className={cn(
              "group mx-1 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 transition-colors",
              activeId === session.id ? "bg-muted" : "hover:bg-muted/50"
            )}
            key={session.id}
            onClick={() => onSelect(session.id)}
          >
            <MessageSquare className="size-3 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-xs">
              {(session as { title?: string }).title || `${session.id.slice(0, 12)}…`}
            </span>
            <Button
              className="size-5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(session.id);
              }}
              size="icon"
              variant="ghost"
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function isToolPart(
  part: UIMessage["parts"][number]
): part is DynamicToolUIPart | ToolUIPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function renderUserMessagePart(part: UIMessage["parts"][number], key: string) {
  if (part.type === "text") {
    return (
      <MessageResponse key={key}>
        {part.text}
      </MessageResponse>
    );
  }

  if (part.type === "file") {
    return (
      <a
        className="underline"
        href={part.url}
        key={key}
        rel="noreferrer"
        target="_blank"
      >
        {part.filename || "Attachment"}
      </a>
    );
  }

  return (
    <pre className="overflow-x-auto text-xs" key={key}>
      {JSON.stringify(part, null, 2)}
    </pre>
  );
}

function renderToolPart(part: DynamicToolUIPart | ToolUIPart, key: string) {
  const toolName =
    part.type === "dynamic-tool"
      ? part.toolName
      : part.type.replace(/^tool-/, "");

  return (
    <Tool
      defaultOpen={
        part.state === "approval-requested" ||
        part.state === "input-streaming" ||
        part.state === "input-available"
      }
      key={key}
    >
      {part.type === "dynamic-tool" ? (
        <ToolHeader
          state={part.state}
          title={toolName}
          toolName={part.toolName}
          type="dynamic-tool"
        />
      ) : (
        <ToolHeader state={part.state} title={toolName} type={part.type} />
      )}
      <ToolContent>
        {part.input !== undefined && <ToolInput input={part.input} />}
        <ToolOutput
          errorText={part.state === "output-error" ? part.errorText : undefined}
          output={part.state === "output-available" ? part.output : undefined}
        />
      </ToolContent>
    </Tool>
  );
}

function renderAssistantMessagePart(part: UIMessage["parts"][number], key: string) {
  if (part.type === "text") {
    return (
      <MessageResponse key={key}>
        {part.text}
      </MessageResponse>
    );
  }

  if (part.type === "reasoning") {
    return (
      <Reasoning
        defaultOpen={part.state === "streaming"}
        isStreaming={part.state === "streaming"}
        key={key}
      >
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }

  if (isToolPart(part)) {
    return renderToolPart(part, key);
  }

  if (part.type === "step-start") {
    return (
      <div
        className="my-2 border-border/70 border-t text-muted-foreground text-xs"
        key={key}
      >
        <span className="-mt-2 inline-block bg-background pr-2">Step</span>
      </div>
    );
  }

  if (part.type === "file") {
    return (
      <a
        className="underline"
        href={part.url}
        key={key}
        rel="noreferrer"
        target="_blank"
      >
        {part.filename || "Attachment"}
      </a>
    );
  }

  return (
    <pre className="overflow-x-auto text-xs" key={key}>
      {JSON.stringify(part, null, 2)}
    </pre>
  );
}

function ChatMessage({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    return (
      <Message from="user">
        <MessageContent>
          {message.parts.map((part, index) =>
            renderUserMessagePart(part, `${message.id}-${index}`)
          )}
        </MessageContent>
      </Message>
    );
  }

  if (message.role === "assistant") {
    return (
      <Message from="assistant">
        <MessageContent>
          {message.parts.map((part, index) =>
            renderAssistantMessagePart(part, `${message.id}-${index}`)
          )}
        </MessageContent>
      </Message>
    );
  }

  return null;
}

type ChatSurfaceProps = {
  activeSessionId: string | null;
  initialMessages: UIMessage[];
  isLoadingMessages: boolean;
  connection: OpenCodeConnectionConfig;
  onAbortSession: (sessionId: string) => Promise<void>;
  onEnsureSession: () => Promise<string | null>;
};

function ChatSurface({
  activeSessionId,
  initialMessages,
  isLoadingMessages,
  connection,
  onAbortSession,
  onEnsureSession,
}: ChatSurfaceProps) {
  const [input, setInput] = useState("");
  const activeSessionIdRef = useRef<string | null>(activeSessionId);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        prepareSendMessagesRequest: async ({ body, id, messages }) => {
          const sessionId = activeSessionIdRef.current || (await onEnsureSession());

          if (!sessionId) {
            throw new Error("Failed to create OpenCode session");
          }

          return {
            body: {
              ...body,
              id,
              messages,
              opencodeToken: connection.token,
              opencodeUrl: connection.url,
              opencodeUsername: connection.username,
              sessionId,
            },
          };
        },
      }),
    [connection.token, connection.url, connection.username, onEnsureSession]
  );

  const { messages, sendMessage, status, stop } = useChat({
    id: activeSessionId ?? "new-chat",
    messages: initialMessages,
    onError: (error) => {
      toast.error(error.message || "AI response failed");
    },
    transport,
  });

  const isGenerating = status === "submitted" || status === "streaming";

  const handleSubmit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!(trimmed && !isGenerating)) {
        return;
      }

      await sendMessage({ text: trimmed });
      setInput("");
    },
    [isGenerating, sendMessage]
  );

  const handleStop = useCallback(async () => {
    await stop();

    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      return;
    }

    await onAbortSession(sessionId);
  }, [onAbortSession, stop]);

  return (
    <>
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="px-4 py-4">
          {isLoadingMessages ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading session...
            </div>
          ) : messages.length === 0 ? (
            <ConversationEmptyState
              description="Ask anything — the AI agent can write code, run commands, search the web, edit files, and build workflows."
              icon={<MessageSquare className="size-8 text-muted-foreground" />}
              title="New Chat"
            />
          ) : (
            messages.map((message) => <ChatMessage key={message.id} message={message} />)
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t px-3 py-3">
        {messages.length === 0 && (
          <div className="mb-2">
            <Suggestions>
              {QUICK_SUGGESTIONS.map((suggestion) => (
                <Suggestion
                  key={suggestion}
                  onClick={(value) => setInput(value)}
                  suggestion={suggestion}
                />
              ))}
            </Suggestions>
          </div>
        )}

        <PromptInput
          className="rounded-xl border bg-background shadow-sm"
          onSubmit={({ text }) => {
            void handleSubmit(text);
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                isGenerating
                  ? "Waiting for response..."
                  : "Ask anything... (Enter to send, Shift+Enter for new line)"
              }
              value={input}
            />
          </PromptInputBody>
          <PromptInputFooter className="justify-end px-2 pb-2">
            <PromptInputTools />
            <PromptInputSubmit
              disabled={!input.trim() && !isGenerating}
              onStop={() => {
                void handleStop();
              }}
              status={status}
            />
          </PromptInputFooter>
        </PromptInput>

        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          Powered by{" "}
          <a
            className="underline"
            href="https://opencode.ai"
            rel="noopener noreferrer"
            target="_blank"
          >
            OpenCode
          </a>
        </p>
      </div>
    </>
  );
}

export function OpenCodeChat({ className }: OpenCodeChatProps) {
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [chatSurfaceKey, setChatSurfaceKey] = useState(0);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const loadSessions = useCallback(async () => {
    const client = getOpenCodeClient();
    if (!client) {
      setSessions([]);
      return;
    }

    try {
      const response = await client.session.list();
      const list = response.data;
      setSessions(Array.isArray(list) ? list : []);
    } catch {
      setSessions([]);
    }
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    const client = getOpenCodeClient();
    if (!client) {
      setInitialMessages([]);
      return;
    }

    setIsLoadingMessages(true);
    try {
      const response = await client.session.messages({ path: { id: sessionId } });
      const list = response.data;
      const history = Array.isArray(list) ? list : [];
      setInitialMessages(mapOpenCodeHistoryToUIMessages(history));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load session messages";
      toast.error(message);
      setInitialMessages([]);
    } finally {
      setChatSurfaceKey((previous) => previous + 1);
      setIsLoadingMessages(false);
    }
  }, []);

  const handleConnected = useCallback(
    async (isConnected: boolean) => {
      setConnected(isConnected);

      if (!isConnected) {
        setSessions([]);
        setActiveSessionId(null);
        setInitialMessages([]);
        setChatSurfaceKey((previous) => previous + 1);
        return;
      }

      await loadSessions();
    },
    [loadSessions]
  );

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      setActiveSessionId(sessionId);
      await loadMessages(sessionId);
    },
    [loadMessages]
  );

  const handleNewSession = useCallback(async () => {
    const client = getOpenCodeClient();
    if (!client) {
      toast.error("OpenCode not connected");
      return;
    }

    try {
      const response = await client.session.create();
      const session = response.data;
      if (!session) {
        throw new Error("No session created");
      }

      setSessions((previous) => [session, ...previous]);
      setActiveSessionId(session.id);
      setInitialMessages([]);
      setChatSurfaceKey((previous) => previous + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create session";
      toast.error(message);
    }
  }, []);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const client = getOpenCodeClient();
      if (!client) {
        return;
      }

      try {
        await client.session.delete({ path: { id: sessionId } });
        setSessions((previous) => previous.filter((session) => session.id !== sessionId));

        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
          setInitialMessages([]);
          setChatSurfaceKey((previous) => previous + 1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete session";
        toast.error(message);
      }
    },
    [activeSessionId]
  );

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (activeSessionId) {
      return activeSessionId;
    }

    const client = getOpenCodeClient();
    if (!client) {
      return null;
    }

    try {
      const response = await client.session.create();
      const session = response.data;
      if (!session) {
        return null;
      }

      setSessions((previous) => [session, ...previous]);
      setActiveSessionId(session.id);
      setInitialMessages([]);
      return session.id;
    } catch {
      return null;
    }
  }, [activeSessionId]);

  const abortSession = useCallback(async (sessionId: string) => {
    const client = getOpenCodeClient();
    if (!client) {
      return;
    }

    try {
      await client.session.abort({ path: { id: sessionId } });
    } catch {
      // Ignore abort errors.
    }
  }, []);

  const connection = getConnectionConfig();

  if (!(connected && connection)) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-4 p-6 text-center",
          className
        )}
      >
        <div className="rounded-full bg-muted p-4">
          <MessageSquare className="size-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">AI Agent not connected</p>
          <p className="text-muted-foreground text-sm">
            Connect OpenCode to use your own AI subscriptions.
          </p>
        </div>
        <OpenCodeConnection onStatusChange={handleConnected} />
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Button
          className="size-6"
          onClick={() => setShowSidebar((visible) => !visible)}
          size="icon"
          variant="ghost"
        >
          {showSidebar ? (
            <ChevronLeft className="size-3.5" />
          ) : (
            <MessageSquare className="size-3.5" />
          )}
        </Button>
        <span className="flex-1 truncate text-sm font-medium">
          {activeSessionId
            ? ((sessions.find((session) => session.id === activeSessionId) as {
                title?: string;
              } | undefined)?.title ?? "Session")
            : "New Chat"}
        </span>
        <OpenCodeConnection className="ml-auto" onStatusChange={handleConnected} />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showSidebar && (
          <div className="w-48 shrink-0">
            <SessionSidebar
              activeId={activeSessionId}
              onDelete={handleDeleteSession}
              onNew={handleNewSession}
              onSelect={handleSelectSession}
              sessions={sessions}
            />
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ChatSurface
            activeSessionId={activeSessionId}
            connection={connection}
            initialMessages={initialMessages}
            isLoadingMessages={isLoadingMessages}
            key={chatSurfaceKey}
            onAbortSession={abortSession}
            onEnsureSession={ensureSession}
          />
        </div>
      </div>
    </div>
  );
}
