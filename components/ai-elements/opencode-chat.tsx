"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
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
import { QuestionToolUI } from "@/components/ai-sdk-elements/question-tool";
import { OpenCodeConnectionMenuItems } from "@/components/ai-elements/opencode-connection";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";
import type { AiAgentContextEnvelope } from "@/lib/ai-agent/page-context/types";
import { useAiAgentPageContext } from "@/lib/ai-agent/page-context/use-ai-agent-page-context";
import { getOpenCodeClient } from "@/lib/opencode-client";
import { useOpenCodeConnection } from "@/components/ai-elements/opencode-provider";
import { mapOpenCodeHistoryToUIMessages } from "@/lib/opencode-chat-adapter";
import { useStableCallback } from "@/lib/use-stable-callback";
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
  Trash2,
  Bot,
  Unplug,
} from "lucide-react";
import type { Session } from "@opencode-ai/sdk/client";

type AIAgentWindowControls = {
  mode: "minimized" | "fullpage";
  onMinimize: () => void;
  onOpenFullpage: () => void;
  onToggleMinimizedView?: () => void;
};

type QuestionToolInput = {
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiple?: boolean;
    custom?: boolean;
  }>;
};

function parseQuestionToolInput(input: unknown): QuestionToolInput | null {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!(value && typeof value === "object")) {
    return null;
  }

  const rawQuestions = (value as { questions?: unknown }).questions;
  if (!Array.isArray(rawQuestions)) {
    return null;
  }

  const questions = rawQuestions.flatMap((rawQuestion) => {
    if (!(rawQuestion && typeof rawQuestion === "object")) {
      return [];
    }

    const questionRecord = rawQuestion as Record<string, unknown>;
    const question =
      typeof questionRecord.question === "string"
        ? questionRecord.question
        : "";
    if (!question) {
      return [];
    }

    const optionsRaw = Array.isArray(questionRecord.options)
      ? questionRecord.options
      : [];
    const options = optionsRaw.flatMap((rawOption) => {
      if (!(rawOption && typeof rawOption === "object")) {
        return [];
      }
      const optionRecord = rawOption as Record<string, unknown>;
      const label =
        typeof optionRecord.label === "string" ? optionRecord.label : "";
      if (!label) {
        return [];
      }
      const description =
        typeof optionRecord.description === "string"
          ? optionRecord.description
          : "";
      return [{ label, description }];
    });

    return [
      {
        question,
        header:
          typeof questionRecord.header === "string"
            ? questionRecord.header
            : "",
        options,
        ...(typeof questionRecord.multiple === "boolean"
          ? { multiple: questionRecord.multiple }
          : {}),
        ...(typeof questionRecord.custom === "boolean"
          ? { custom: questionRecord.custom }
          : {}),
      },
    ];
  });

  if (questions.length === 0) {
    return null;
  }

  return { questions };
}

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

function getToolName(part: DynamicToolUIPart | ToolUIPart): string {
  return part.type === "dynamic-tool"
    ? part.toolName
    : part.type.replace(/^tool-/, "");
}

function lastAssistantMessageHasCompletedQuestionOutput(
  messages: UIMessage[],
): boolean {
  const message = messages[messages.length - 1];
  if (!message || message.role !== "assistant") {
    return false;
  }

  const lastStepStartIndex = message.parts.reduce((lastIndex, part, index) => {
    return part.type === "step-start" ? index : lastIndex;
  }, -1);

  const stepToolParts = message.parts
    .slice(lastStepStartIndex + 1)
    .filter(isToolPart);
  const questionParts = stepToolParts.filter(
    (part) => getToolName(part) === "question",
  );

  return (
    questionParts.length > 0 &&
    questionParts.every(
      (part) =>
        part.state === "output-available" || part.state === "output-error",
    )
  );
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

function renderToolPart(
  part: DynamicToolUIPart | ToolUIPart,
  key: string,
  onQuestionSubmit?: (toolCallId: string, answers: string[][]) => void,
  onQuestionDismiss?: (toolCallId: string) => void,
) {
  const toolName =
    part.type === "dynamic-tool"
      ? part.toolName
      : part.type.replace(/^tool-/, "");
  const questionInput = parseQuestionToolInput(part.input);

  if (
    toolName === "question" &&
    (part.state === "approval-requested" ||
      part.state === "input-streaming" ||
      part.state === "input-available") &&
    questionInput
  ) {
    return (
      <QuestionToolUI
        key={key}
        input={questionInput}
        onSubmit={(answers) => onQuestionSubmit?.(part.toolCallId, answers)}
        onDismiss={() => onQuestionDismiss?.(part.toolCallId)}
      />
    );
  }

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
  onQuestionSubmit?: (toolCallId: string, answers: string[][]) => void,
  onQuestionDismiss?: (toolCallId: string) => void,
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
    return renderToolPart(part, key, onQuestionSubmit, onQuestionDismiss);
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

function ChatMessage({
  message,
  onQuestionSubmit,
  onQuestionDismiss,
}: {
  message: UIMessage;
  onQuestionSubmit?: (toolCallId: string, answers: string[][]) => void;
  onQuestionDismiss?: (toolCallId: string) => void;
}) {
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
            renderAssistantMessagePart(
              part,
              `${message.id}-${index}`,
              onQuestionSubmit,
              onQuestionDismiss,
            ),
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
              sessionId: activeSessionIdRef.current,
              pageContext,
            },
          };
        },
      }),
    [activeSessionId, pageContext],
  );

  const { messages, sendMessage, addToolOutput, status, stop } = useChat({
    id: activeSessionId,
    messages: initialMessages,
    onError: (error) => {
      toast.error(error.message || "AI response failed");
    },
    sendAutomaticallyWhen: ({ messages }) =>
      lastAssistantMessageIsCompleteWithToolCalls({ messages }) ||
      lastAssistantMessageHasCompletedQuestionOutput(messages),
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

  const handleQuestionSubmit = useCallback(
    async (toolCallId: string, answers: string[][]) => {
      await addToolOutput({
        tool: "question",
        toolCallId,
        state: "output-available",
        output: { answers },
      });
    },
    [addToolOutput],
  );

  const handleQuestionDismiss = useCallback(
    async (toolCallId: string) => {
      await addToolOutput({
        tool: "question",
        toolCallId,
        state: "output-error",
        errorText: "Question dismissed by user",
      });
    },
    [addToolOutput],
  );

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
                <ChatMessage
                  key={message.id}
                  message={message}
                  onQuestionSubmit={handleQuestionSubmit}
                  onQuestionDismiss={handleQuestionDismiss}
                />
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
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [sessionSelectorOpen, setSessionSelectorOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [chatSurfaceKey, setChatSurfaceKey] = useState(0);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [hasLoadedSessions, setHasLoadedSessions] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { connected, connectionConfig: connection } = useOpenCodeConnection();
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

  const connectionKey = useMemo(() => {
    if (!connection) {
      return null;
    }
    return getOpenCodeSessionConnectionKey(connection);
  }, [connection?.url, connection?.username]);

  const prevConnectionKeyRef = useRef<string | null>(null);

  const setActiveSession = useCallback((sessionId: string | null) => {
    activeSessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
  }, []);

  const handleConnectClick = useCallback(() => {
    router.push("/app/settings?tab=agent-server");
  }, [router]);

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
    } catch (err) {
      console.error("[opencode] loadSessions error:", err);
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
    initialSessionIdRef.current = initialSessionId;
    initialSessionAppliedRef.current = null;
  }, [initialSessionId]);

  useEffect(() => {
    autoSelectFirstSessionOnConnectRef.current =
      autoSelectFirstSessionOnConnect;
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
        toast.error("The requested Agent session is not available.");
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
      if (connectedRef.current === isConnected) {
        return;
      }

      connectedRef.current = isConnected;

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
        markSessionWorkflowMappingOpened(
          currentConnectionKey,
          fallbackSessionId,
        );
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

  // Wrap handleConnected so the effect below only re-runs when `connected`
  // changes — not every time handleConnected's deps change.
  const stableHandleConnected = useStableCallback(handleConnected);

  // When connection state changes globally, fire our init callback
  useEffect(() => {
    void stableHandleConnected(connected);
  }, [connected, stableHandleConnected]);

  useEffect(() => {
    const currentKey = connectionKey;
    const prevKey = prevConnectionKeyRef.current;

    if (currentKey !== prevKey && currentKey !== null) {
      prevConnectionKeyRef.current = currentKey;

      if (connected && hasLoadedSessions) {
        setHasLoadedSessions(false);
        setSessions([]);
        setActiveSessionId(null);
        setUnreadCount(0);
        resetInactiveSession();

        loadSessions().then((latestSessions) => {
          if (connectedRef.current) {
            setHasLoadedSessions(true);
            applyInitialSessionIfNeeded(latestSessions);
          }
        });
      }
    }
  }, [
    connectionKey,
    connected,
    hasLoadedSessions,
    resetInactiveSession,
    loadSessions,
    setActiveSessionId,
    applyInitialSessionIfNeeded,
  ]);

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
      toast.error("Agent not connected");
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
          <DropdownMenuContent
            align="start"
            className="w-64 max-h-72 overflow-y-auto"
          >
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
        <DropdownMenu onOpenChange={setActionsMenuOpen} open={actionsMenuOpen}>
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

            {hasWindowModeSection || hasDeleteSessionOption ? (
              <DropdownMenuSeparator />
            ) : null}

            <OpenCodeConnectionMenuItems
              onStatusChange={handleConnected}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {hasConnection ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {activeSessionId && connection ? (
              <ChatSurface
                activeSessionId={activeSessionId}
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
                    No active Agent session
                  </p>
                ) : (
                  <>
                    <div className="rounded-full bg-primary/10 p-4">
                      <Bot className="size-8 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">No active Agent session</p>
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
          <Button onClick={handleConnectClick} size="sm" variant="secondary">
            Configure
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <Unplug className="size-8 text-destructive" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">AI Agent not connected</p>
            <p className="text-muted-foreground text-sm">
              Configure your OpenCode server to start chatting and create
              workflows.
            </p>
          </div>
          <Button onClick={handleConnectClick} size="sm">
            Configure Agent
          </Button>
        </div>
      )}
    </div>
  );
}

export type OpenCodeChatProps = AIAgentChatProps;
export const OpenCodeChat = AIAgentChat;
