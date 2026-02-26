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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AiAgentContextEnvelope } from "@/lib/ai-agent/page-context/types";
import { useAiAgentPageContext } from "@/lib/ai-agent/page-context/use-ai-agent-page-context";
import {
  getConnectionConfig,
  getOpenCodeClient,
  type OpenCodeConnectionConfig,
} from "@/lib/opencode-client";
import { useOpencode } from "@/hooks/use-opencode";
import { mapOpenCodeHistoryToUIMessages } from "@/lib/opencode-chat-adapter";
import {
  getOpenCodeSessionConnectionKey,
  markSessionWorkflowMappingOpened,
  removeSessionWorkflowMapping,
  upsertSessionWorkflowMapping,
} from "@/lib/opencode-session-mapping";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Minus,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import type { Session } from "@opencode-ai/sdk/client";

type AIAgentWindowControls = {
  mode: "minimized" | "fullpage";
  onMinimize: () => void;
  onOpenFullpage: () => void;
  onToggleMinimizedView?: () => void;
};

export type AIAgentChatProps = {
  className?: string;
  workflowId?: string | null;
  workflowName?: string;
  initialSessionId?: string | null;
  autoSelectFirstSessionOnConnect?: boolean;
  onSessionLinked?: (sessionId: string) => void;
  pageContext?: AiAgentContextEnvelope | null;
  uiVariant?: "default" | "minimized";
  minimizedDisplayMode?: "thread" | "input-only";
  windowControls?: AIAgentWindowControls;
};

const QUICK_SUGGESTIONS = [
  "Create a workflow that sends a Slack message when a webhook fires",
  "Explain what this workflow does",
  "Add an HTTP request step after the trigger",
] as const;



function isToolPart(
  part: UIMessage["parts"][number],
): part is DynamicToolUIPart | ToolUIPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function renderUserMessagePart(part: UIMessage["parts"][number], key: string) {
  if (part.type === "text") {
    return <MessageResponse key={key}>{part.text}</MessageResponse>;
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

function renderAssistantMessagePart(
  part: UIMessage["parts"][number],
  key: string,
) {
  if (part.type === "text") {
    return <MessageResponse key={key}>{part.text}</MessageResponse>;
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
            renderUserMessagePart(part, `${message.id}-${index}`),
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
            renderAssistantMessagePart(part, `${message.id}-${index}`),
          )}
        </MessageContent>
      </Message>
    );
  }

  return null;
}

function getSessionTitle(session: Session): string {
  return (session as { title?: string }).title || `${session.id.slice(0, 12)}…`;
}

type ChatSurfaceProps = {
  activeSessionId: string;
  initialMessages: UIMessage[];
  isLoadingMessages: boolean;
  connection: OpenCodeConnectionConfig;
  pageContext: AiAgentContextEnvelope | null;
  onAbortSession: (sessionId: string) => Promise<void>;
  onNewMessages?: (count: number) => void;
  uiVariant: "default" | "minimized";
  hideConversation?: boolean;
};

function ChatSurface({
  activeSessionId,
  initialMessages,
  isLoadingMessages,
  connection,
  pageContext,
  onAbortSession,
  onNewMessages,
  uiVariant,
  hideConversation = false,
}: ChatSurfaceProps) {
  const [input, setInput] = useState("");
  const activeSessionIdRef = useRef(activeSessionId);
  const prevMessageCountRef = useRef(initialMessages.length);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        prepareSendMessagesRequest: ({ body, id, messages }) => {
          return {
            body: {
              ...body,
              id,
              messages,
              opencodeToken: connection.token,
              opencodeUrl: connection.url,
              opencodeUsername: connection.username,
              sessionId: activeSessionIdRef.current,
              pageContext,
            },
          };
        },
      }),
    [
      activeSessionId,
      connection.token,
      connection.url,
      connection.username,
      pageContext,
    ],
  );

  const { messages, sendMessage, status, stop } = useChat({
    id: activeSessionId,
    messages: initialMessages,
    onError: (error) => {
      toast.error(error.message || "AI response failed");
    },
    transport,
  });

  // Notify parent when new assistant messages arrive
  const onNewMessagesRef = useRef(onNewMessages);
  useEffect(() => {
    onNewMessagesRef.current = onNewMessages;
  }, [onNewMessages]);

  useEffect(() => {
    const prev = prevMessageCountRef.current;
    const curr = messages.length;
    if (curr > prev) {
      const newAssistantMessages = messages
        .slice(prev)
        .filter((m) => m.role === "assistant").length;
      if (newAssistantMessages > 0) {
        onNewMessagesRef.current?.(newAssistantMessages);
      }
    }
    prevMessageCountRef.current = curr;
  }, [messages]);

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
    [isGenerating, sendMessage],
  );

  const handleStop = useCallback(async () => {
    await stop();
    await onAbortSession(activeSessionIdRef.current);
  }, [onAbortSession, stop]);

  const isMinimizedVariant = uiVariant === "minimized";
  const shouldShowConversation = !hideConversation;

  return (
    <>
      {shouldShowConversation ? (
        <Conversation className="min-h-0 flex-1">
          <ConversationContent
            className={cn(isMinimizedVariant ? "px-3 py-3" : "px-4 py-4")}
          >
            {isLoadingMessages ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" />
                Loading session...
              </div>
            ) : messages.length === 0 ? (
              <ConversationEmptyState
                description="Ask anything — the AI agent can write code, run commands, search the web, edit files, and build workflows."
                icon={
                  <MessageSquare className="size-8 text-muted-foreground" />
                }
                title="New Chat"
              />
            ) : (
              messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      ) : null}

      <div
        className={cn(
          "shrink-0",
          shouldShowConversation && "border-t",
          isMinimizedVariant ? "px-2 py-2" : "px-3 py-3",
        )}
      >
        {shouldShowConversation && messages.length === 0 && (
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
          className={cn(
            "rounded-xl border bg-background shadow-sm",
            isMinimizedVariant && "rounded-lg",
          )}
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
      </div>
    </>
  );
}

export function AIAgentChat({
  className,
  workflowId,
  workflowName,
  initialSessionId,
  autoSelectFirstSessionOnConnect = true,
  onSessionLinked,
  pageContext: pageContextOverride,
  uiVariant = "default",
  minimizedDisplayMode = "input-only",
  windowControls,
}: AIAgentChatProps) {
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [sessionSelectorOpen, setSessionSelectorOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [providerSettingsOpen, setProviderSettingsOpen] = useState(false);
  const [chatSurfaceKey, setChatSurfaceKey] = useState(0);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { connectViaDaemon } = useOpencode();
  const [hasLoadedSessions, setHasLoadedSessions] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const initialSessionAppliedRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const connectedRef = useRef(false);
  const initialSessionIdRef = useRef(initialSessionId);
  const autoSelectFirstSessionOnConnectRef = useRef(
    autoSelectFirstSessionOnConnect,
  );
  const connectionKeyRef = useRef<string | null>(null);
  const messageLoadRequestIdRef = useRef(0);
  const linkSessionToWorkflowRef = useRef<
    (sessionId: string, sessionTitle?: string) => void
  >(() => undefined);
  const resolvedPageContext = useAiAgentPageContext();
  const pageContext = pageContextOverride ?? resolvedPageContext;
  const isMinimizedVariant = uiVariant === "minimized";
  const isInputOnlyMinimized =
    isMinimizedVariant && minimizedDisplayMode === "input-only";
  const [connection, setConnection] = useState<OpenCodeConnectionConfig | null>(null);

  useEffect(() => {
    setConnection(getConnectionConfig());
  }, []);
  const connectionKey = useMemo(() => {
    if (!connection) {
      return null;
    }
    return getOpenCodeSessionConnectionKey(connection);
  }, [connection?.url, connection?.username]);

  const setActiveSession = useCallback((sessionId: string | null) => {
    activeSessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
  }, []);

  const handleConnectClick = async () => {
    if (isConnecting) {
      return;
    }

    setIsConnecting(true);
    try {
      const result = await connectViaDaemon();
      if (result.connected) {
        await handleConnected(true);
        toast.success(
          result.startedOpencode
            ? "Local AI Agent started and connected."
            : "Connected to local AI Agent."
        );
        return;
      }

      await handleConnected(false);

      if (result.reason === "bridge_unavailable") {
        toast.error("Desktop bridge is not running. Start superr-bridge and retry.");
        return;
      }
      if (result.reason === "not_installed") {
        toast.error("OpenCode is not installed locally. Install it from the desktop bridge.");
        return;
      }
      if (result.reason === "missing_config") {
        toast.error("Desktop bridge did not provide connection details.");
        return;
      }
      if (result.reason === "start_failed") {
        toast.error(result.error || "Failed to start local OpenCode server.");
        return;
      }
      if (result.reason === "ping_failed") {
        toast.error("OpenCode started but is not reachable yet. Please retry.");
        return;
      }
      toast.error(result.error || "Failed to connect to local AI Agent.");
    } finally {
      setIsConnecting(false);
    }
  };

  const cancelPendingMessageLoads = useCallback(() => {
    messageLoadRequestIdRef.current += 1;
    setIsLoadingMessages(false);
  }, []);

  const resetInactiveSession = useCallback(() => {
    cancelPendingMessageLoads();
    setInitialMessages([]);
    setChatSurfaceKey((previous) => previous + 1);
  }, [cancelPendingMessageLoads]);

  const loadSessions = useCallback(async (): Promise<Session[]> => {
    const client = getOpenCodeClient();
    if (!client) {
      setSessions([]);
      return [];
    }

    try {
      const response = await client.session.list();
      const list = response.data;
      const nextSessions = Array.isArray(list)
        ? [...list].sort(
            (left, right) => right.time.updated - left.time.updated,
          )
        : [];
      setSessions(nextSessions);
      return nextSessions;
    } catch {
      setSessions([]);
      return [];
    }
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    const client = getOpenCodeClient();
    if (!client) {
      if (activeSessionIdRef.current === sessionId) {
        setInitialMessages([]);
        setChatSurfaceKey((previous) => previous + 1);
      }
      setIsLoadingMessages(false);
      return;
    }

    const requestId = messageLoadRequestIdRef.current + 1;
    messageLoadRequestIdRef.current = requestId;
    setIsLoadingMessages(true);

    try {
      const response = await client.session.messages({
        path: { id: sessionId },
      });

      if (
        requestId !== messageLoadRequestIdRef.current ||
        activeSessionIdRef.current !== sessionId
      ) {
        return;
      }

      const list = response.data;
      const history = Array.isArray(list) ? list : [];
      setInitialMessages(mapOpenCodeHistoryToUIMessages(history));
    } catch (error) {
      if (
        requestId !== messageLoadRequestIdRef.current ||
        activeSessionIdRef.current !== sessionId
      ) {
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Failed to load session messages";
      toast.error(message);
      setInitialMessages([]);
    } finally {
      if (requestId !== messageLoadRequestIdRef.current) {
        return;
      }
      setChatSurfaceKey((previous) => previous + 1);
      setIsLoadingMessages(false);
    }
  }, []);

  const linkSessionToWorkflow = useCallback(
    (sessionId: string, sessionTitle?: string) => {
      onSessionLinked?.(sessionId);

      if (!(workflowId && connectionKey)) {
        return;
      }

      upsertSessionWorkflowMapping({
        connectionKey,
        sessionId,
        workflowId,
        workflowName,
        sessionTitle,
      });
    },
    [connectionKey, onSessionLinked, workflowId, workflowName],
  );

  useEffect(() => {
    linkSessionToWorkflowRef.current = linkSessionToWorkflow;
  }, [linkSessionToWorkflow]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    initialSessionIdRef.current = initialSessionId;
    initialSessionAppliedRef.current = null;
  }, [initialSessionId]);

  useEffect(() => {
    autoSelectFirstSessionOnConnectRef.current = autoSelectFirstSessionOnConnect;
  }, [autoSelectFirstSessionOnConnect]);

  useEffect(() => {
    connectionKeyRef.current = connectionKey;
  }, [connectionKey]);

  const applyInitialSessionIfNeeded = useCallback(
    async (sessionList: Session[]): Promise<boolean> => {
      const normalizedInitialSessionId = initialSessionIdRef.current?.trim();
      if (!normalizedInitialSessionId) {
        return false;
      }

      if (initialSessionAppliedRef.current === normalizedInitialSessionId) {
        return false;
      }

      if (activeSessionIdRef.current === normalizedInitialSessionId) {
        initialSessionAppliedRef.current = normalizedInitialSessionId;
        return true;
      }

      const targetSession = sessionList.find(
        (session) => session.id === normalizedInitialSessionId,
      );
      if (!targetSession) {
        initialSessionAppliedRef.current = normalizedInitialSessionId;
        toast.error("The requested OpenCode session is not available.");
        return false;
      }

      initialSessionAppliedRef.current = normalizedInitialSessionId;
      setActiveSession(normalizedInitialSessionId);
      linkSessionToWorkflowRef.current(
        normalizedInitialSessionId,
        getSessionTitle(targetSession),
      );
      const currentConnectionKey = connectionKeyRef.current;
      if (currentConnectionKey) {
        markSessionWorkflowMappingOpened(
          currentConnectionKey,
          normalizedInitialSessionId,
        );
      }
      await loadMessages(normalizedInitialSessionId);
      return true;
    },
    [loadMessages, setActiveSession],
  );

  const handleConnected = useCallback(
    async (isConnected: boolean) => {
      setConnection(getConnectionConfig());
      if (connectedRef.current === isConnected) {
        return;
      }

      connectedRef.current = isConnected;
      setConnected(isConnected);

      if (!isConnected) {
        setHasLoadedSessions(false);
        setSessions([]);
        setActiveSession(null);
        setUnreadCount(0);
        resetInactiveSession();
        return;
      }

      setHasLoadedSessions(false);
      const latestSessions = await loadSessions();
      if (!connectedRef.current) {
        return;
      }
      setHasLoadedSessions(true);
      if (await applyInitialSessionIfNeeded(latestSessions)) {
        return;
      }

      const currentActiveSessionId = activeSessionIdRef.current;
      const activeSessionStillExists =
        currentActiveSessionId !== null &&
        latestSessions.some((session) => session.id === currentActiveSessionId);
      if (activeSessionStillExists) {
        return;
      }

      if (!autoSelectFirstSessionOnConnectRef.current) {
        setActiveSession(null);
        setUnreadCount(0);
        resetInactiveSession();
        return;
      }

      const fallbackSession = latestSessions[0] ?? null;
      const fallbackSessionId = fallbackSession?.id ?? null;
      setActiveSession(fallbackSessionId);
      setUnreadCount(0);

      if (!fallbackSessionId) {
        resetInactiveSession();
        return;
      }

      linkSessionToWorkflowRef.current(
        fallbackSessionId,
        fallbackSession ? getSessionTitle(fallbackSession) : undefined,
      );
      const currentConnectionKey = connectionKeyRef.current;
      if (currentConnectionKey) {
        markSessionWorkflowMappingOpened(currentConnectionKey, fallbackSessionId);
      }
      await loadMessages(fallbackSessionId);
    },
    [
      applyInitialSessionIfNeeded,
      loadMessages,
      loadSessions,
      resetInactiveSession,
      setActiveSession,
    ],
  );

  useEffect(() => {
    if (!(connected && hasLoadedSessions)) {
      return;
    }
    void applyInitialSessionIfNeeded(sessions);
  }, [applyInitialSessionIfNeeded, connected, hasLoadedSessions, sessions]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      setActiveSession(sessionId);
      setUnreadCount(0);
      const selectedSession = sessions.find(
        (session) => session.id === sessionId,
      );
      linkSessionToWorkflow(
        sessionId,
        selectedSession ? getSessionTitle(selectedSession) : undefined,
      );
      const currentConnectionKey = connectionKeyRef.current;
      if (currentConnectionKey) {
        markSessionWorkflowMappingOpened(currentConnectionKey, sessionId);
      }
      await loadMessages(sessionId);
    },
    [linkSessionToWorkflow, loadMessages, sessions, setActiveSession],
  );

  const handleNewSession = useCallback(async () => {
    const client = getOpenCodeClient();
    if (!client) {
      toast.error("OpenCode not connected");
      return;
    }

    setIsCreatingSession(true);
    try {
      const response = await client.session.create();
      const session = response.data;
      if (!session) {
        throw new Error("No session created");
      }

      setSessions((previous) => [session, ...previous]);
      setActiveSession(session.id);
      cancelPendingMessageLoads();
      setInitialMessages([]);
      setUnreadCount(0);
      setChatSurfaceKey((previous) => previous + 1);
      linkSessionToWorkflow(session.id, getSessionTitle(session));
      const currentConnectionKey = connectionKeyRef.current;
      if (currentConnectionKey) {
        markSessionWorkflowMappingOpened(currentConnectionKey, session.id);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create session";
      toast.error(message);
    } finally {
      setIsCreatingSession(false);
    }
  }, [cancelPendingMessageLoads, linkSessionToWorkflow, setActiveSession]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const client = getOpenCodeClient();
      if (!client) {
        return;
      }

      try {
        await client.session.delete({ path: { id: sessionId } });
        const remainingSessions = sessions.filter(
          (session) => session.id !== sessionId,
        );
        setSessions(remainingSessions);
        const currentConnectionKey = connectionKeyRef.current;
        if (currentConnectionKey) {
          removeSessionWorkflowMapping(currentConnectionKey, sessionId);
        }

        if (activeSessionIdRef.current === sessionId) {
          const fallbackSession = remainingSessions[0] ?? null;
          const fallbackSessionId = fallbackSession?.id ?? null;
          setActiveSession(fallbackSessionId);
          setUnreadCount(0);
          if (fallbackSessionId) {
            linkSessionToWorkflow(
              fallbackSessionId,
              fallbackSession ? getSessionTitle(fallbackSession) : undefined,
            );
            if (currentConnectionKey) {
              markSessionWorkflowMappingOpened(
                currentConnectionKey,
                fallbackSessionId,
              );
            }
            await loadMessages(fallbackSessionId);
          } else {
            resetInactiveSession();
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete session";
        toast.error(message);
      }
    },
    [
      linkSessionToWorkflow,
      loadMessages,
      resetInactiveSession,
      sessions,
      setActiveSession,
    ],
  );

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

  const activeSession = useMemo(() => {
    if (!activeSessionId) {
      return null;
    }
    return sessions.find((session) => session.id === activeSessionId) ?? null;
  }, [activeSessionId, sessions]);
  const hasConnection = connected && Boolean(connection);
  const headerTitle = hasConnection
    ? activeSession
      ? getSessionTitle(activeSession)
      : activeSessionId
        ? "Session"
        : "New Session"
    : "Not Connected";
  const canToggleSessions = hasConnection;
  const showThreadToggle =
    windowControls?.mode === "minimized" &&
    Boolean(windowControls.onToggleMinimizedView);
  const isShowingThread = minimizedDisplayMode === "thread";
  const hasDeleteSessionOption = hasConnection && activeSessionId;
  const hasWindowModeSection = Boolean(windowControls);

  const handleNewMessages = useCallback(
    (count: number) => {
      if (isInputOnlyMinimized) {
        setUnreadCount((prev) => prev + count);
      }
    },
    [isInputOnlyMinimized],
  );

  const handleToggleThread = useCallback(() => {
    if (!isShowingThread) {
      // Opening the thread — clear unread badge
      setUnreadCount(0);
    }
    windowControls?.onToggleMinimizedView?.();
  }, [isShowingThread, windowControls]);

  return (
    <div
      className={cn(
        "flex flex-col",
        !isInputOnlyMinimized && "h-full",
        className,
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b",
          isMinimizedVariant ? "px-2 py-1.5" : "px-3 py-2",
        )}
      >
        <DropdownMenu
          onOpenChange={setSessionSelectorOpen}
          open={sessionSelectorOpen}
        >
          <DropdownMenuTrigger asChild>
            <Button
              className={cn(
                "h-7 max-w-[200px] gap-1 px-2 font-medium",
                isMinimizedVariant ? "text-xs" : "text-sm",
              )}
              disabled={!canToggleSessions}
              size="sm"
              variant="ghost"
            >
              <span className="truncate">{headerTitle}</span>
              {canToggleSessions ? (
                <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
            <DropdownMenuItem
              disabled={isCreatingSession}
              onSelect={() => {
                void handleNewSession();
              }}
            >
              {isCreatingSession ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              New Session
            </DropdownMenuItem>
            {sessions.length > 0 ? <DropdownMenuSeparator /> : null}
            {sessions.map((session) => (
              <DropdownMenuItem
                key={session.id}
                onSelect={() => {
                  void handleSelectSession(session.id);
                }}
              >
                <MessageSquare className="size-4 shrink-0" />
                <span className="flex-1 truncate">
                  {getSessionTitle(session)}
                </span>
                {activeSessionId === session.id ? (
                  <Check className="size-4 shrink-0 ml-auto" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1" />
        {showThreadToggle ? (
          <div className="relative">
            <Button
              className="size-6"
              onClick={handleToggleThread}
              size="icon"
              variant="ghost"
              title={isShowingThread ? "Collapse Chat" : "Expand Chat"}
            >
              {isShowingThread ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronUp className="size-3.5" />
              )}
            </Button>
            {!isShowingThread && unreadCount > 0 ? (
              <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </div>
        ) : null}
        <DropdownMenu
          onOpenChange={setActionsMenuOpen}
          open={actionsMenuOpen}
        >
          <DropdownMenuTrigger asChild>
            <Button className="size-6" size="icon" variant="ghost">
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" forceMount>
            {windowControls ? (
              <>
                {windowControls.mode === "minimized" ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      windowControls.onOpenFullpage();
                    }}
                  >
                    <Maximize2 className="size-4" />
                    Open Full Page
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => {
                      windowControls.onMinimize();
                    }}
                  >
                    <Minimize2 className="size-4" />
                    Minimize
                  </DropdownMenuItem>
                )}
              </>
            ) : null}

            {hasDeleteSessionOption ? (
              <>
                {hasWindowModeSection ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => {
                    if (activeSessionId) {
                      void handleDeleteSession(activeSessionId);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete Session
                </DropdownMenuItem>
              </>
            ) : null}

            {(hasWindowModeSection || hasDeleteSessionOption) ? (
              <DropdownMenuSeparator />
            ) : null}

            <OpenCodeConnection
              onStatusChange={handleConnected}
              onTriggerClick={() => {
                setActionsMenuOpen(false);
              }}
              triggerVariant="menu-item"
            />
            {hasConnection ? (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setActionsMenuOpen(false);
                  setProviderSettingsOpen(true);
                }}
              >
                <Settings className="size-4" />
                Provider Settings
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        {hasConnection ? (
          <ProviderSettings
            dialogOnly
            externalOpen={providerSettingsOpen}
            onExternalOpenChange={setProviderSettingsOpen}
          />
        ) : null}
      </div>

      {hasConnection ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {activeSessionId && connection ? (
              <ChatSurface
                activeSessionId={activeSessionId}
                connection={connection}
                initialMessages={initialMessages}
                isLoadingMessages={isLoadingMessages}
                key={chatSurfaceKey}
                onAbortSession={abortSession}
                onNewMessages={handleNewMessages}
                pageContext={pageContext}
                hideConversation={isInputOnlyMinimized}
                uiVariant={uiVariant}
              />
            ) : (
              <div
                className={cn(
                  "flex h-full items-center",
                  isInputOnlyMinimized
                    ? "gap-2 px-2 py-2"
                    : "flex-col justify-center gap-4 p-6 text-center",
                )}
                data-testid="opencode-chat-inactive"
              >
                {isInputOnlyMinimized ? (
                  <p className="flex-1 text-muted-foreground text-xs">
                    No active OpenCode session
                  </p>
                ) : (
                  <>
                    <div className="rounded-full bg-muted p-4">
                      <MessageSquare className="size-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">No active OpenCode session</p>
                      <p className="text-muted-foreground text-sm">
                        Start a session to begin chatting.
                      </p>
                    </div>
                  </>
                )}
                <Button
                  data-testid="opencode-start-session"
                  disabled={isCreatingSession}
                  onClick={() => {
                    void handleNewSession();
                  }}
                  size={isInputOnlyMinimized ? "sm" : "default"}
                >
                  {isCreatingSession ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 size-4" />
                  )}
                  Start Session
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : isInputOnlyMinimized ? (
        <div className="flex items-center gap-2 p-2">
          <p className="flex-1 text-muted-foreground text-xs">
            AI Agent not connected
          </p>
          <Button
            onClick={handleConnectClick}
            disabled={isConnecting}
            size="sm"
            variant="secondary"
          >
            {isConnecting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Connect
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="rounded-full bg-muted p-4">
            <MessageSquare className="size-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">AI Agent not connected</p>
            <p className="text-muted-foreground text-sm">
              Connect OpenCode to use your own AI subscriptions.
            </p>
          </div>
          <Button
            onClick={handleConnectClick}
            disabled={isConnecting}
            size="sm"
          >
            {isConnecting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Connect OpenCode
          </Button>
        </div>
      )}
    </div>
  );
}

export type OpenCodeChatProps = AIAgentChatProps;
export const OpenCodeChat = AIAgentChat;
