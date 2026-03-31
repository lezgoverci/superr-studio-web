import type {
  HubBrainResponse,
  HubBrainSourceMutationResponse,
  HubMemberProfile,
} from "./types";
import { getStarterSources } from "./content";

const STUB_NOTEBOOK_ID_PREFIX = "stub-notebook-";
const LOCAL_NOTEBOOKLM_SERVICE_URL = "http://127.0.0.1:8000";
const LOCAL_NOTEBOOKLM_SERVICE_TOKEN = "dev-notebooklm-token";

type NotebookServiceNotebook = {
  id: string;
  title?: string | null;
  status?: string | null;
  summary?: string | null;
  sourceCount?: number | null;
};

type NotebookServiceSource = {
  id: string;
  title?: string | null;
  type?: string | null;
  url?: string | null;
};

function getNotebookServiceConfig() {
  const isProduction = process.env.NODE_ENV === "production";
  const baseUrl =
    process.env.NOTEBOOKLM_SERVICE_URL?.trim() ||
    (isProduction ? "" : LOCAL_NOTEBOOKLM_SERVICE_URL);
  const token =
    process.env.NOTEBOOKLM_SERVICE_TOKEN?.trim() ||
    (isProduction ? "" : LOCAL_NOTEBOOKLM_SERVICE_TOKEN);

  return {
    baseUrl,
    token,
    configured: Boolean(baseUrl && token),
  };
}

function getStubNotebookId(userId: string) {
  return `${STUB_NOTEBOOK_ID_PREFIX}${userId}`;
}

function isStubNotebookId(value: string | null | undefined) {
  return Boolean(value?.startsWith(STUB_NOTEBOOK_ID_PREFIX));
}

async function notebookServiceCall<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const config = getNotebookServiceConfig();

  if (!(config.baseUrl && config.token)) {
    throw new Error("NotebookLM service is not configured");
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `NotebookLM service request failed (${response.status}): ${message}`
    );
  }

  return response.json() as Promise<T>;
}

function buildStubBrain(profile: HubMemberProfile): HubBrainResponse {
  const config = getNotebookServiceConfig();

  return {
    configured: false,
    serviceMode: "stub",
    serviceMessage:
      process.env.NODE_ENV === "production"
        ? "NotebookLM service is not configured yet. Set NOTEBOOKLM_SERVICE_URL and NOTEBOOKLM_SERVICE_TOKEN to enable live notebooks."
        : `NotebookLM service is not reachable. Start the local service at ${config.baseUrl || LOCAL_NOTEBOOKLM_SERVICE_URL}.`,
    notebookId: profile.notebooklmNotebookId ?? getStubNotebookId(profile.userId),
    notebookTitle: `${profile.displayName ?? profile.userName ?? "Member"} Brain`,
    status: profile.notebooklmNotebookId ? "stubbed" : "not_provisioned",
    summary:
      "The platform-managed Brain contract is wired, but the external NotebookLM service is not configured in this environment.",
    sourceCount: 0,
    starterSources: getStarterSources(profile),
  };
}

function mapNotebookToBrain(
  profile: HubMemberProfile,
  notebook: NotebookServiceNotebook
): HubBrainResponse {
  return {
    configured: true,
    serviceMode: "external",
    serviceMessage: null,
    notebookId: notebook.id,
    notebookTitle:
      notebook.title ?? `${profile.displayName ?? profile.userName ?? "Member"} Brain`,
    status: notebook.status ?? "ready",
    summary: notebook.summary ?? null,
    sourceCount: notebook.sourceCount ?? 0,
    starterSources: getStarterSources(profile),
  };
}

function getBrainTitle(profile: HubMemberProfile) {
  return `${profile.displayName ?? profile.userName ?? "Member"} Brain`;
}

function getTemplateKey(profile: HubMemberProfile) {
  if (profile.level >= 3) {
    return "shadow-operator";
  }
  if (profile.level === 2) {
    return "creator";
  }
  return "explorer";
}

export async function getBrainState(
  profile: HubMemberProfile
): Promise<HubBrainResponse> {
  const config = getNotebookServiceConfig();
  const notebookId = profile.notebooklmNotebookId;

  if (!(config.configured && notebookId) || isStubNotebookId(notebookId)) {
    return buildStubBrain(profile);
  }

  try {
    const notebook = await notebookServiceCall<NotebookServiceNotebook>(
      `/internal/notebooks/${encodeURIComponent(notebookId)}`
    );
    return mapNotebookToBrain(profile, notebook);
  } catch (error) {
    console.error("[hub/brain] Failed to load notebook metadata:", error);
    return {
      ...buildStubBrain(profile),
      notebookId,
      status: "service_error",
      serviceMessage:
        error instanceof Error
          ? error.message
          : "Failed to load notebook metadata.",
    };
  }
}

export async function provisionBrain(profile: HubMemberProfile) {
  const config = getNotebookServiceConfig();

  if (!config.configured) {
    return {
      notebookId: getStubNotebookId(profile.userId),
      brain: buildStubBrain(profile),
    };
  }

  const notebook = await notebookServiceCall<NotebookServiceNotebook>(
    "/internal/notebooks/provision",
    {
      method: "POST",
      body: JSON.stringify({
        memberId: profile.userId,
        title: getBrainTitle(profile),
        templateKey: getTemplateKey(profile),
      }),
    }
  );

  const notebookId = notebook.id;
  const starterSources = getStarterSources(profile).filter(
    (source) => source.type === "text"
  );

  for (const source of starterSources) {
    try {
      await notebookServiceCall<NotebookServiceSource>(
        `/internal/notebooks/${encodeURIComponent(notebookId)}/sources/text`,
        {
          method: "POST",
          body: JSON.stringify({
            title: source.title,
            content: source.value,
          }),
        }
      );
    } catch (error) {
      console.error(
        `[hub/brain] Failed to seed starter source "${source.title}":`,
        error
      );
    }
  }

  return {
    notebookId,
    brain: await getBrainState({
      ...profile,
      notebooklmNotebookId: notebookId,
    }),
  };
}

export async function addNotebookUrlSource(
  profile: HubMemberProfile,
  input: { url: string }
): Promise<HubBrainSourceMutationResponse> {
  const notebookId = profile.notebooklmNotebookId;
  const config = getNotebookServiceConfig();

  if (!(config.configured && notebookId) || isStubNotebookId(notebookId)) {
    throw new Error(
      "NotebookLM source actions require a configured NotebookLM service."
    );
  }

  const source = await notebookServiceCall<NotebookServiceSource>(
    `/internal/notebooks/${encodeURIComponent(notebookId)}/sources/url`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );

  return {
    success: true,
    source: {
      id: source.id,
      title: source.title ?? null,
      type: source.type ?? null,
      url: source.url ?? input.url,
    },
    brain: await getBrainState(profile),
  };
}

export async function addNotebookTextSource(
  profile: HubMemberProfile,
  input: { title: string; content: string }
): Promise<HubBrainSourceMutationResponse> {
  const notebookId = profile.notebooklmNotebookId;
  const config = getNotebookServiceConfig();

  if (!(config.configured && notebookId) || isStubNotebookId(notebookId)) {
    throw new Error(
      "NotebookLM source actions require a configured NotebookLM service."
    );
  }

  const source = await notebookServiceCall<NotebookServiceSource>(
    `/internal/notebooks/${encodeURIComponent(notebookId)}/sources/text`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );

  return {
    success: true,
    source: {
      id: source.id,
      title: source.title ?? input.title,
      type: source.type ?? "text",
      url: source.url ?? null,
    },
    brain: await getBrainState(profile),
  };
}
