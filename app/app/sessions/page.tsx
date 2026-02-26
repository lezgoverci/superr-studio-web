"use client";

import type { Session } from "@opencode-ai/sdk/client";
import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";
import {
  ExternalLink,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Workflow,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { OpenCodeConnection } from "@/components/ai-elements/opencode-connection";
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
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-sdk-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-sdk-elements/tool";
import { PageContainer } from "@/components/app-shell/page-container";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type SavedWorkflow } from "@/lib/api-client";
import { mapOpenCodeHistoryToUIMessages } from "@/lib/opencode-chat-adapter";
import { getConnectionConfig, getOpenCodeClient } from "@/lib/opencode-client";
import {
  getOpenCodeSessionConnectionKey,
  getSessionWorkflowMapping,
  listSessionWorkflowMappings,
  markSessionWorkflowMappingOpened,
  removeSessionWorkflowMapping,
  upsertSessionWorkflowMapping,
} from "@/lib/opencode-session-mapping";
import { cn } from "@/lib/utils";

const TOOL_TYPE_PREFIX_REGEX = /^tool-/;

function isToolPart(
  part: UIMessage["parts"][number]
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
      : part.type.replace(TOOL_TYPE_PREFIX_REGEX, "");

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
        {part.input !== undefined ? <ToolInput input={part.input} /> : null}
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
  key: string
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

function sortSessionsByUpdated(sessions: Session[]): Session[] {
  return [...sessions].sort(
    (left, right) => right.time.updated - left.time.updated
  );
}

function getSessionTitle(session: Session): string {
  const title = (session as { title?: string }).title;
  if (title?.trim()) {
    return title;
  }
  return `${session.id.slice(0, 12)}…`;
}

function formatSessionTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function isCurrentWorkflowPlaceholder(name: string): boolean {
  return name === "__current__" || name === "~~__CURRENT__~~";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Sessions page coordinates connection, listing, linking, and thread rendering.
export default function SessionsPage() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [deleteTargetSession, setDeleteTargetSession] =
    useState<Session | null>(null);
  const [workflowPickerOpen, setWorkflowPickerOpen] = useState(false);
  const [workflowPickerSession, setWorkflowPickerSession] =
    useState<Session | null>(null);
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);

  const connection = getConnectionConfig();
  const connectionKey = connection
    ? getOpenCodeSessionConnectionKey(connection)
    : null;
  const mappings = connectionKey
    ? listSessionWorkflowMappings(connectionKey)
    : {};

  const selectedSession = useMemo(() => {
    if (!selectedSessionId) {
      return null;
    }
    return sessions.find((session) => session.id === selectedSessionId) ?? null;
  }, [selectedSessionId, sessions]);

  const filteredSessions = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    if (!normalizedSearch) {
      return sessions;
    }

    return sessions.filter((session) => {
      const mapping = mappings[session.id];
      const searchText = [
        getSessionTitle(session),
        session.id,
        mapping?.workflowName,
        mapping?.workflowId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchText.includes(normalizedSearch);
    });
  }, [mappings, searchQuery, sessions]);

  const loadMessages = useCallback(async (sessionId: string) => {
    const client = getOpenCodeClient();
    if (!client) {
      setMessages([]);
      return;
    }

    setIsLoadingMessages(true);
    try {
      const response = await client.session.messages({
        path: { id: sessionId },
      });
      const list = response.data;
      const history = Array.isArray(list) ? list : [];
      setMessages(mapOpenCodeHistoryToUIMessages(history));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load session messages";
      toast.error(message);
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    const client = getOpenCodeClient();
    if (!client) {
      setSessions([]);
      setSelectedSessionId(null);
      setMessages([]);
      return;
    }

    setIsLoadingSessions(true);
    try {
      const response = await client.session.list();
      const list = Array.isArray(response.data) ? response.data : [];
      const sorted = sortSessionsByUpdated(list);
      setSessions(sorted);
      setSelectedSessionId((previous) => {
        if (previous && sorted.some((session) => session.id === previous)) {
          return previous;
        }
        return sorted[0]?.id ?? null;
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load sessions";
      toast.error(message);
      setSessions([]);
      setSelectedSessionId(null);
      setMessages([]);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const handleConnectionChange = useCallback(
    async (isConnected: boolean) => {
      setConnected(isConnected);
      if (!isConnected) {
        setSessions([]);
        setSelectedSessionId(null);
        setMessages([]);
        return;
      }
      await loadSessions();
    },
    [loadSessions]
  );

  const openSessionInWorkflow = useCallback(
    (session: Session, workflowId: string) => {
      const params = new URLSearchParams({
        tab: "ai",
        opencodeSessionId: session.id,
      });
      router.push(`/app/workflows/${workflowId}?${params.toString()}`);
    },
    [router]
  );

  const ensureWorkflowsLoaded = useCallback(async () => {
    if (workflows.length > 0) {
      return workflows;
    }

    setIsLoadingWorkflows(true);
    try {
      const list = await api.workflow.getAll();
      const filtered = list.filter(
        (workflow) => !isCurrentWorkflowPlaceholder(workflow.name)
      );
      setWorkflows(filtered);
      return filtered;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load workflows";
      toast.error(message);
      return [];
    } finally {
      setIsLoadingWorkflows(false);
    }
  }, [workflows]);

  const openWorkflowPicker = useCallback(
    async (session: Session) => {
      const availableWorkflows = await ensureWorkflowsLoaded();
      if (availableWorkflows.length === 0) {
        toast.error("No workflows available. Create a workflow first.");
        return;
      }
      setWorkflowPickerSession(session);
      setSelectedWorkflowId(availableWorkflows[0].id);
      setWorkflowPickerOpen(true);
    },
    [ensureWorkflowsLoaded]
  );

  const handleOpenInWorkflow = useCallback(
    async (session: Session) => {
      if (!connectionKey) {
        return;
      }

      const mapping = getSessionWorkflowMapping(connectionKey, session.id);
      if (mapping?.workflowId) {
        markSessionWorkflowMappingOpened(connectionKey, session.id);
        openSessionInWorkflow(session, mapping.workflowId);
        return;
      }

      await openWorkflowPicker(session);
    },
    [connectionKey, openSessionInWorkflow, openWorkflowPicker]
  );

  const handleConfirmWorkflowLink = useCallback(() => {
    if (!(workflowPickerSession && selectedWorkflowId && connectionKey)) {
      return;
    }

    const selectedWorkflow = workflows.find(
      (workflow) => workflow.id === selectedWorkflowId
    );
    upsertSessionWorkflowMapping({
      connectionKey,
      sessionId: workflowPickerSession.id,
      workflowId: selectedWorkflowId,
      workflowName: selectedWorkflow?.name,
      sessionTitle: getSessionTitle(workflowPickerSession),
    });
    markSessionWorkflowMappingOpened(connectionKey, workflowPickerSession.id);
    setWorkflowPickerOpen(false);
    openSessionInWorkflow(workflowPickerSession, selectedWorkflowId);
  }, [
    connectionKey,
    openSessionInWorkflow,
    selectedWorkflowId,
    workflowPickerSession,
    workflows,
  ]);

  const handleCreateSession = useCallback(async () => {
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

      setSessions((previous) => sortSessionsByUpdated([session, ...previous]));
      setSelectedSessionId(session.id);
      setMessages([]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create session";
      toast.error(message);
    } finally {
      setIsCreatingSession(false);
    }
  }, []);

  const handleDeleteSession = useCallback(async () => {
    if (!deleteTargetSession) {
      return;
    }

    const client = getOpenCodeClient();
    if (!client) {
      toast.error("Agent not connected");
      return;
    }

    try {
      await client.session.delete({ path: { id: deleteTargetSession.id } });
      if (connectionKey) {
        removeSessionWorkflowMapping(connectionKey, deleteTargetSession.id);
      }
      setDeleteTargetSession(null);
      await loadSessions();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete session";
      toast.error(message);
    }
  }, [connectionKey, deleteTargetSession, loadSessions]);

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      return;
    }

    if (connectionKey) {
      markSessionWorkflowMappingOpened(connectionKey, selectedSessionId);
    }
    loadMessages(selectedSessionId).catch((error) => {
      console.error("Failed to load selected session messages:", error);
    });
  }, [connectionKey, loadMessages, selectedSessionId]);

  let sessionListContent: ReactNode = null;
  if (isLoadingSessions) {
    sessionListContent = (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading sessions...
      </div>
    );
  } else if (filteredSessions.length === 0) {
    sessionListContent = (
      <p className="px-2 py-6 text-center text-muted-foreground text-sm">
        No sessions found.
      </p>
    );
  } else {
    sessionListContent = filteredSessions.map((session) => {
      const mapping = mappings[session.id];
      const isActive = session.id === selectedSessionId;
      let workflowMappingLabel: ReactNode = null;
      if (mapping?.workflowName) {
        workflowMappingLabel = (
          <p className="mt-1 truncate text-primary text-xs">
            Workflow: {mapping.workflowName}
          </p>
        );
      } else if (mapping?.workflowId) {
        workflowMappingLabel = (
          <p className="mt-1 truncate text-primary text-xs">
            Workflow: {mapping.workflowId}
          </p>
        );
      }

      return (
        <button
          className={cn(
            "mb-1 w-full rounded-md border px-3 py-2 text-left transition-colors",
            isActive
              ? "border-primary/30 bg-primary/10"
              : "border-transparent hover:border-border hover:bg-muted/50"
          )}
          key={session.id}
          onClick={() => setSelectedSessionId(session.id)}
          type="button"
        >
          <p className="truncate font-medium text-sm">
            {getSessionTitle(session)}
          </p>
          <p className="mt-0.5 truncate text-muted-foreground text-xs">
            {formatSessionTime(session.time.updated)}
          </p>
          {workflowMappingLabel}
        </button>
      );
    });
  }

  let selectedSessionContent: ReactNode = null;
  if (selectedSession) {
    let threadBody: ReactNode = null;
    if (isLoadingMessages) {
      threadBody = (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading session...
        </div>
      );
    } else if (messages.length === 0) {
      threadBody = (
        <ConversationEmptyState
          description="This session does not have messages yet."
          icon={<MessageSquare className="size-8 text-muted-foreground" />}
          title="Empty Session"
        />
      );
    } else {
      threadBody = messages.map((message) => (
        <ChatMessage key={message.id} message={message} />
      ));
    }

    selectedSessionContent = (
      <Conversation className="h-full min-h-0">
        <ConversationContent className="px-4 py-4">
          {threadBody}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    );
  } else {
    selectedSessionContent = (
      <div className="flex h-full items-center justify-center p-6">
        <ConversationEmptyState
          description="Choose a session to review the full conversation thread."
          icon={<MessageSquare className="size-8 text-muted-foreground" />}
          title="No Session Selected"
        />
      </div>
    );
  }

  if (!(connected && connection)) {
    return (
      <PageContainer>
        <div className="flex h-full min-h-[480px] flex-col items-center justify-center gap-4 rounded-xl border bg-background p-6 text-center">
          <div className="rounded-full bg-muted p-4">
            <MessageSquare className="size-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">Agent is not connected</p>
            <p className="text-muted-foreground text-sm">
              Connect Agent to browse local sessions and reopen threads.
            </p>
          </div>
          <OpenCodeConnection onStatusChange={handleConnectionChange} />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      className="h-full overflow-hidden"
      contentClassName="h-full max-w-none p-0"
    >
      <div className="flex h-full min-h-0">
        <aside className="flex w-80 shrink-0 flex-col border-r bg-background">
          <div className="border-b p-4">
            <div className="mb-3 flex items-center gap-2">
              <h1 className="flex-1 font-semibold text-lg">Sessions</h1>
              <OpenCodeConnection onStatusChange={handleConnectionChange} />
            </div>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search sessions..."
                value={searchQuery}
              />
            </div>
            <Button
              className="w-full"
              disabled={isCreatingSession}
              onClick={() => {
                handleCreateSession().catch((error) => {
                  console.error("Failed to create session:", error);
                });
              }}
            >
              {isCreatingSession ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              New Session
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {sessionListContent}
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            {selectedSession ? (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">
                    {getSessionTitle(selectedSession)}
                  </p>
                  <p className="truncate text-muted-foreground text-xs">
                    Updated {formatSessionTime(selectedSession.time.updated)}
                  </p>
                </div>
                <Button
                  disabled={!selectedSession}
                  onClick={() => {
                    if (selectedSession) {
                      handleOpenInWorkflow(selectedSession).catch((error) => {
                        console.error(
                          "Failed to open session in workflow:",
                          error
                        );
                      });
                    }
                  }}
                  size="sm"
                  variant="secondary"
                >
                  <ExternalLink className="mr-2 size-4" />
                  Open in Workflow
                </Button>
                <Button
                  onClick={() => setDeleteTargetSession(selectedSession)}
                  size="sm"
                  variant="ghost"
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Select a session</p>
            )}
          </div>

          <div className="min-h-0 flex-1">{selectedSessionContent}</div>
        </section>
      </div>

      <Dialog
        onOpenChange={(open) => {
          setWorkflowPickerOpen(open);
          if (!open) {
            setWorkflowPickerSession(null);
            setSelectedWorkflowId("");
          }
        }}
        open={workflowPickerOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Session to Workflow</DialogTitle>
            <DialogDescription>
              Choose which workflow this Agent session belongs to. This
              mapping is stored locally in your browser.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="font-medium text-sm">
                {workflowPickerSession
                  ? getSessionTitle(workflowPickerSession)
                  : ""}
              </p>
              <p className="text-muted-foreground text-xs">
                Select a workflow to reopen this session in canvas + AI tab.
              </p>
            </div>

            <Select
              onValueChange={setSelectedWorkflowId}
              value={selectedWorkflowId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select workflow" />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((workflow) => (
                  <SelectItem key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoadingWorkflows ? (
              <p className="text-muted-foreground text-xs">
                Loading workflows…
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setWorkflowPickerOpen(false);
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedWorkflowId}
              onClick={handleConfirmWorkflowLink}
            >
              <Workflow className="mr-2 size-4" />
              Link and Open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetSession(null);
          }
        }}
        open={Boolean(deleteTargetSession)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this Agent session and all of its
              conversation history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleDeleteSession().catch((error) => {
                  console.error("Failed to delete session:", error);
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
