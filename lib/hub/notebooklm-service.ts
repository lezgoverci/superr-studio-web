import { getStarterSources } from "./content";
import type {
  HubBrainResponse,
  HubBrainSourceMutationResponse,
  HubStarterSource,
  HubMemberProfile,
} from "./types";

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

type StubNotebookState = {
  title: string;
  sources: HubStarterSource[];
};

const stubNotebookStore = new Map<string, StubNotebookState>();

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

function buildDisconnectedBrain(profile: HubMemberProfile): HubBrainResponse {
  const config = getNotebookServiceConfig();

  return {
    configured: config.configured,
    serviceMode: config.configured ? "external" : "stub",
    isLinked: false,
    serviceMessage:
      config.configured
        ? "Connect a NotebookLM notebook you already own. The Hub will sync to it after you paste a notebook URL or ID."
        : process.env.NODE_ENV === "production"
          ? "NotebookLM sync is not configured yet. Set NOTEBOOKLM_SERVICE_URL and NOTEBOOKLM_SERVICE_TOKEN to enable live notebooks."
          : `NotebookLM service is not reachable. Start the local service at ${config.baseUrl || LOCAL_NOTEBOOKLM_SERVICE_URL} to enable live sync.`,
    notebookId: null,
    notebookTitle: null,
    status: "not_linked",
    summary:
      "Link your own NotebookLM notebook to seed starter context and make the Hub more personal.",
    sourceCount: 0,
    starterSources: getStarterSources(profile),
  };
}

function getBrainTitle(profile: HubMemberProfile) {
  return `${profile.displayName ?? profile.userName ?? "Member"} Brain`;
}

function getOrCreateStubNotebook(
  profile: HubMemberProfile,
  notebookId: string,
  options?: { seedStarterSources?: boolean }
) {
  const existing = stubNotebookStore.get(notebookId);

  if (existing) {
    if (options?.seedStarterSources && existing.sources.length === 0) {
      existing.sources = [...getStarterSources(profile)];
    }
    return existing;
  }

  const created: StubNotebookState = {
    title: getBrainTitle(profile),
    sources: options?.seedStarterSources ? [...getStarterSources(profile)] : [],
  };
  stubNotebookStore.set(notebookId, created);
  return created;
}

function buildStubBrain(profile: HubMemberProfile): HubBrainResponse {
  const config = getNotebookServiceConfig();

  if (!profile.notebooklmNotebookId) {
    return buildDisconnectedBrain(profile);
  }

  const notebookId = profile.notebooklmNotebookId;
  const stubNotebook = getOrCreateStubNotebook(profile, notebookId, {
    seedStarterSources: true,
  });

  return {
    configured: false,
    serviceMode: "stub",
    isLinked: true,
    serviceMessage:
      process.env.NODE_ENV === "production"
        ? "NotebookLM sync is not configured yet. This linked notebook cannot be refreshed until the service is enabled."
        : `NotebookLM service is not reachable. Working in local stub mode until ${config.baseUrl || LOCAL_NOTEBOOKLM_SERVICE_URL} is available.`,
    notebookId,
    notebookTitle: stubNotebook.title,
    status: "linked_stub",
    summary:
      "Your Brain is linked in local stub mode. Starter context is available now, and live NotebookLM sync resumes when the service is reachable.",
    sourceCount:
      stubNotebook.sources.length > 0
        ? stubNotebook.sources.length
        : getStarterSources(profile).length,
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
    isLinked: true,
    serviceMessage: null,
    notebookId: notebook.id,
    notebookTitle:
      notebook.title ??
      getBrainTitle(profile),
    status: notebook.status ?? "linked",
    summary:
      notebook.summary ??
      "Your NotebookLM Brain is linked and ready for new context.",
    sourceCount: notebook.sourceCount ?? 0,
    starterSources: getStarterSources(profile),
  };
}

function getTemplateKey(profile: HubMemberProfile) {
  if (profile.level >= 5) {
    return "sage";
  }
  if (profile.level >= 3) {
    return "adept";
  }
  return "seeker";
}

function buildServiceErrorBrain(
  profile: HubMemberProfile,
  notebookId: string,
  message: string
): HubBrainResponse {
  return {
    configured: true,
    serviceMode: "external",
    isLinked: true,
    serviceMessage: message,
    notebookId,
    notebookTitle: getBrainTitle(profile),
    status: "service_error",
    summary:
      "We could not load this notebook right now. Retry the connection or relink the notebook.",
    sourceCount: 0,
    starterSources: getStarterSources(profile),
  };
}

function normalizeNotebookIdOrUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Paste a NotebookLM notebook URL or ID.");
  }

  try {
    const url = new URL(trimmed);
    const queryId =
      url.searchParams.get("id") ??
      url.searchParams.get("notebookId") ??
      url.searchParams.get("notebook_id");

    if (queryId?.trim()) {
      return queryId.trim();
    }

    const segments = url.pathname.split("/").filter(Boolean);
    const notebookSegmentIndex = segments.findIndex(
      (segment) => segment === "notebook" || segment === "notebooks"
    );

    if (notebookSegmentIndex >= 0 && segments[notebookSegmentIndex + 1]) {
      return segments[notebookSegmentIndex + 1];
    }

    const fallbackSegment = segments.at(-1);
    if (fallbackSegment?.trim()) {
      return fallbackSegment.trim();
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

async function seedNotebookSources(
  profile: HubMemberProfile,
  notebookId: string
): Promise<void> {
  const config = getNotebookServiceConfig();
  const starterSources = getStarterSources({
    ...profile,
    notebooklmNotebookId: notebookId,
  });

  if (!config.configured || isStubNotebookId(notebookId)) {
    getOrCreateStubNotebook(profile, notebookId, { seedStarterSources: true });
    return;
  }

  for (const source of starterSources) {
    try {
      if (source.type === "url") {
        await notebookServiceCall<NotebookServiceSource>(
          `/internal/notebooks/${encodeURIComponent(notebookId)}/sources/url`,
          {
            method: "POST",
            body: JSON.stringify({
              url: source.value,
            }),
          }
        );
        continue;
      }

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
}

export async function getBrainState(
  profile: HubMemberProfile
): Promise<HubBrainResponse> {
  const config = getNotebookServiceConfig();
  const notebookId = profile.notebooklmNotebookId;

  if (!notebookId) {
    return buildDisconnectedBrain(profile);
  }

  if (!config.configured || isStubNotebookId(notebookId)) {
    return buildStubBrain(profile);
  }

  try {
    const notebook = await notebookServiceCall<NotebookServiceNotebook>(
      `/internal/notebooks/${encodeURIComponent(notebookId)}`
    );
    return mapNotebookToBrain(profile, notebook);
  } catch (error) {
    console.error("[hub/brain] Failed to load notebook metadata:", error);
    return buildServiceErrorBrain(
      profile,
      notebookId,
      error instanceof Error
        ? error.message
        : "Failed to load notebook metadata."
    );
  }
}

export async function linkBrain(
  profile: HubMemberProfile,
  input: { notebookIdOrUrl: string }
) {
  const notebookId = normalizeNotebookIdOrUrl(input.notebookIdOrUrl);
  const config = getNotebookServiceConfig();

  if (profile.notebooklmNotebookId === notebookId) {
    return {
      notebookId,
      brain: await getBrainState({
        ...profile,
        notebooklmNotebookId: notebookId,
      }),
    };
  }

  if (!config.configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NotebookLM sync is not configured yet. Try again after the Brain service is enabled."
      );
    }

    await seedNotebookSources(profile, notebookId);
    return {
      notebookId,
      brain: buildStubBrain({
        ...profile,
        notebooklmNotebookId: notebookId,
      }),
    };
  }

  await notebookServiceCall<NotebookServiceNotebook>(
    `/internal/notebooks/${encodeURIComponent(notebookId)}`
  );
  await seedNotebookSources(profile, notebookId);

  return {
    notebookId,
    brain: await getBrainState({
      ...profile,
      notebooklmNotebookId: notebookId,
    }),
  };
}

export async function provisionBrain(profile: HubMemberProfile) {
  const config = getNotebookServiceConfig();

  if (!config.configured) {
    const notebookId = getStubNotebookId(profile.userId);
    await seedNotebookSources(profile, notebookId);

    return {
      notebookId,
      brain: buildStubBrain({
        ...profile,
        notebooklmNotebookId: notebookId,
      }),
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
  await seedNotebookSources(profile, notebookId);

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

  if (!notebookId) {
    throw new Error("Link your Brain before adding sources.");
  }

  if (!config.configured || isStubNotebookId(notebookId)) {
    const stubNotebook = getOrCreateStubNotebook(profile, notebookId, {
      seedStarterSources: true,
    });
    const source: HubStarterSource = {
      id: crypto.randomUUID(),
      title: input.url,
      description: "Saved URL source",
      type: "url",
      value: input.url,
    };
    stubNotebook.sources.push(source);

    return {
      success: true,
      source: {
        id: source.id,
        title: source.title,
        type: source.type,
        url: input.url,
      },
      brain: buildStubBrain({
        ...profile,
        notebooklmNotebookId: notebookId,
      }),
    };
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

  if (!notebookId) {
    throw new Error("Link your Brain before adding sources.");
  }

  if (!config.configured || isStubNotebookId(notebookId)) {
    const stubNotebook = getOrCreateStubNotebook(profile, notebookId, {
      seedStarterSources: true,
    });
    const source: HubStarterSource = {
      id: crypto.randomUUID(),
      title: input.title,
      description: "Saved text source",
      type: "text",
      value: input.content,
    };
    stubNotebook.sources.push(source);

    return {
      success: true,
      source: {
        id: source.id,
        title: source.title,
        type: source.type,
        url: null,
      },
      brain: buildStubBrain({
        ...profile,
        notebooklmNotebookId: notebookId,
      }),
    };
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
