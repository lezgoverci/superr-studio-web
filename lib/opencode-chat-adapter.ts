import type { Part, ToolPart } from "@opencode-ai/sdk/client";
import type { UIMessage } from "ai";

type OpenCodeMessageInfo = {
  id?: string;
  role?: string;
  parts?: unknown;
  content?: unknown;
};

type OpenCodeHistoryMessage = {
  info?: OpenCodeMessageInfo;
  parts?: unknown;
  id?: string;
  role?: string;
};

function dedupeParts(parts: Part[]): Part[] {
  const seen = new Set<string>();
  const deduped: Part[] = [];

  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index];
    if (seen.has(part.id)) {
      continue;
    }
    seen.add(part.id);
    deduped.unshift(part);
  }

  return deduped;
}

function parseToolOutput(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

function mapToolPart(part: ToolPart): UIMessage["parts"][number] {
  if (part.state.status === "pending") {
    return {
      type: "dynamic-tool",
      toolName: part.tool,
      toolCallId: part.callID,
      state: "input-streaming",
      input: part.state.input,
    };
  }

  if (part.state.status === "running") {
    return {
      type: "dynamic-tool",
      toolName: part.tool,
      toolCallId: part.callID,
      state: "input-available",
      input: part.state.input,
    };
  }

  if (part.state.status === "completed") {
    return {
      type: "dynamic-tool",
      toolName: part.tool,
      toolCallId: part.callID,
      state: "output-available",
      input: part.state.input,
      output: parseToolOutput(part.state.output),
    };
  }

  return {
    type: "dynamic-tool",
    toolName: part.tool,
    toolCallId: part.callID,
    state: "output-error",
    input: part.state.input,
    errorText: part.state.error,
  };
}

function mapUnknownPartToText(part: Part): UIMessage["parts"][number] {
  return {
    type: "text",
    text: `\`\`\`json\n${JSON.stringify(part, null, 2)}\n\`\`\``,
  };
}

function mapPartToUiPart(part: Part): UIMessage["parts"][number] {
  if (part.type === "text") {
    return {
      type: "text",
      text: part.text,
    };
  }

  if (part.type === "reasoning") {
    return {
      type: "reasoning",
      text: part.text,
    };
  }

  if (part.type === "tool") {
    return mapToolPart(part);
  }

  if (part.type === "step-start") {
    return { type: "step-start" };
  }

  if (part.type === "file") {
    return {
      type: "file",
      mediaType: part.mime,
      filename: part.filename,
      url: part.url,
    };
  }

  if (part.type === "subtask") {
    return {
      type: "text",
      text: `Subtask: ${part.description}\n\n${part.prompt}`,
    };
  }

  return mapUnknownPartToText(part);
}

function normalizeHistoryMessage(raw: OpenCodeHistoryMessage): {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
} | null {
  const info = (raw.info ?? raw) as OpenCodeMessageInfo;

  if (!info?.id) {
    return null;
  }

  if (!(info.role === "user" || info.role === "assistant")) {
    return null;
  }

  let candidateParts: unknown[] = [];
  if (Array.isArray(raw.parts)) {
    candidateParts = raw.parts;
  } else if (Array.isArray(info.parts)) {
    candidateParts = info.parts;
  }

  return {
    id: info.id,
    role: info.role,
    parts: dedupeParts((candidateParts as Part[]) ?? []),
  };
}

export function mapOpenCodeHistoryToUIMessages(
  history: unknown[]
): UIMessage[] {
  const normalized = history
    .map((entry) => normalizeHistoryMessage(entry as OpenCodeHistoryMessage))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  return normalized.map((message) => {
    const mappedParts = message.parts.map(mapPartToUiPart);

    if (mappedParts.length > 0) {
      return {
        id: message.id,
        role: message.role,
        parts: mappedParts,
      } satisfies UIMessage;
    }

    return {
      id: message.id,
      role: message.role,
      parts: [{ type: "text", text: "" }],
    } satisfies UIMessage;
  });
}
