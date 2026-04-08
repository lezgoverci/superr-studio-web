import { toNextJsHandler } from "better-auth/next-js";
import { and, desc, eq, gt } from "drizzle-orm";
import { createAuth, resolveAuthBaseURL } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifications } from "@/lib/db/schema";

const OAUTH_CALLBACK_PATH = "/api/auth/oauth2/callback/";
const CONSUMED_OAUTH_STATE_PREFIX = "oauth2-consumed:";
const OAUTH_REPLAY_GUARD_PREFIX = "oauth2-replay:";
const CONSUMED_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_REPLAY_WINDOW_MS = 60 * 1000;

type ConsumedOAuthState = {
  providerId: string;
  redirectURL: string;
  consumedAt: number;
};

type ReplayableOAuthState = {
  callbackURL: string;
  providerId: string;
  reservedAt: number;
};

type OAuthStatePayload = {
  callbackURL: string;
  codeVerifier: string;
  errorURL?: string;
  newUserURL?: string;
  expiresAt: number;
  link?: {
    email: string;
    userId: string;
  };
  requestSignUp?: boolean;
};

function getOAuthCallbackContext(request: Request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(OAUTH_CALLBACK_PATH)) {
    return;
  }

  const providerId = url.pathname.slice(OAUTH_CALLBACK_PATH.length).trim();
  const state = url.searchParams.get("state")?.trim();
  if (!(providerId && state)) {
    return;
  }

  return { providerId, state, url };
}

function getConsumedOAuthStateIdentifier(state: string) {
  return `${CONSUMED_OAUTH_STATE_PREFIX}${state}`;
}

function getReplayableOAuthStateIdentifier(state: string) {
  return `${OAUTH_REPLAY_GUARD_PREFIX}${state}`;
}

function parseConsumedOAuthState(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<ConsumedOAuthState>;
    if (
      typeof parsed.providerId !== "string" ||
      typeof parsed.redirectURL !== "string" ||
      typeof parsed.consumedAt !== "number"
    ) {
      return;
    }

    return parsed as ConsumedOAuthState;
  } catch {
    return;
  }
}

function parseReplayableOAuthState(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<ReplayableOAuthState>;
    if (
      typeof parsed.providerId !== "string" ||
      typeof parsed.callbackURL !== "string" ||
      typeof parsed.reservedAt !== "number"
    ) {
      return;
    }

    return parsed as ReplayableOAuthState;
  } catch {
    return;
  }
}

function parseOAuthStatePayload(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<OAuthStatePayload>;
    if (
      typeof parsed.callbackURL !== "string" ||
      typeof parsed.codeVerifier !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return;
    }

    return parsed as OAuthStatePayload;
  } catch {
    return;
  }
}

async function findConsumedOAuthState(state: string) {
  const [record] = await db
    .select()
    .from(verifications)
    .where(
      and(
        eq(verifications.identifier, getConsumedOAuthStateIdentifier(state)),
        gt(verifications.expiresAt, new Date())
      )
    )
    .orderBy(desc(verifications.createdAt))
    .limit(1);

  if (!record) {
    return;
  }

  return parseConsumedOAuthState(record.value);
}

async function findReplayableOAuthState(state: string) {
  const [record] = await db
    .select()
    .from(verifications)
    .where(
      and(
        eq(verifications.identifier, getReplayableOAuthStateIdentifier(state)),
        gt(verifications.expiresAt, new Date())
      )
    )
    .orderBy(desc(verifications.createdAt))
    .limit(1);

  if (!record) {
    return;
  }

  return parseReplayableOAuthState(record.value);
}

async function storeConsumedOAuthState(
  state: string,
  providerId: string,
  redirectURL: string
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONSUMED_OAUTH_STATE_TTL_MS);
  const value = JSON.stringify({
    providerId,
    redirectURL,
    consumedAt: now.getTime(),
  } satisfies ConsumedOAuthState);

  await db.insert(verifications).values({
    id: crypto.randomUUID(),
    identifier: getConsumedOAuthStateIdentifier(state),
    value,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
}

function getSuccessfulRedirectURL(request: Request, response: Response) {
  const location = response.headers.get("location");
  if (!location || response.status < 300 || response.status >= 400) {
    return;
  }

  const resolvedLocation = new URL(location, resolveAuthBaseURL(request));
  if (resolvedLocation.searchParams.has("error")) {
    return;
  }

  return resolvedLocation.toString();
}

async function ensureReplayableOAuthState(request: Request) {
  const callbackContext = getOAuthCallbackContext(request);
  if (!callbackContext) {
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const [replayGuard] = await tx
        .select()
        .from(verifications)
        .where(
          and(
            eq(
              verifications.identifier,
              getReplayableOAuthStateIdentifier(callbackContext.state)
            ),
            gt(verifications.expiresAt, new Date())
          )
        )
        .orderBy(desc(verifications.createdAt))
        .limit(1);

      if (replayGuard) {
        return;
      }

      const [verificationRecord] = await tx
        .select()
        .from(verifications)
        .where(
          and(
            eq(verifications.identifier, callbackContext.state),
            gt(verifications.expiresAt, new Date())
          )
        )
        .orderBy(desc(verifications.createdAt))
        .limit(1);

      if (!verificationRecord) {
        return;
      }

      const payload = parseOAuthStatePayload(verificationRecord.value);
      if (!payload) {
        return;
      }

      const now = new Date();
      const duplicateExpiresAt = new Date(
        Math.min(
          new Date(verificationRecord.expiresAt).getTime(),
          now.getTime() + OAUTH_REPLAY_WINDOW_MS
        )
      );

      await tx.insert(verifications).values([
        {
          id: crypto.randomUUID(),
          identifier: callbackContext.state,
          value: verificationRecord.value,
          expiresAt: duplicateExpiresAt,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: crypto.randomUUID(),
          identifier: getReplayableOAuthStateIdentifier(callbackContext.state),
          value: JSON.stringify({
            callbackURL: payload.callbackURL,
            providerId: callbackContext.providerId,
            reservedAt: now.getTime(),
          } satisfies ReplayableOAuthState),
          expiresAt: duplicateExpiresAt,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    });
  } catch (error) {
    console.error("Failed to reserve replayable OAuth state", error);
  }
}

async function handleDuplicateOAuthCallback(request: Request) {
  const callbackContext = getOAuthCallbackContext(request);
  if (!callbackContext) {
    return;
  }

  let consumedState: ConsumedOAuthState | undefined;
  try {
    consumedState = await findConsumedOAuthState(callbackContext.state);
  } catch (error) {
    console.error("Failed to read consumed OAuth callback state", error);
    return;
  }

  if (!consumedState) {
    return;
  }

  if (consumedState.providerId !== callbackContext.providerId) {
    return;
  }

  return Response.redirect(consumedState.redirectURL, 302);
}

async function rememberSuccessfulOAuthCallback(
  request: Request,
  response: Response
) {
  const callbackContext = getOAuthCallbackContext(request);
  if (!callbackContext) {
    return;
  }

  let redirectURL = getSuccessfulRedirectURL(request, response);
  if (!redirectURL && response.headers.has("set-cookie")) {
    const replayableState = await findReplayableOAuthState(
      callbackContext.state
    );
    if (replayableState?.providerId === callbackContext.providerId) {
      redirectURL = new URL(
        replayableState.callbackURL,
        resolveAuthBaseURL(request)
      ).toString();
    }
  }

  if (!redirectURL) {
    return;
  }

  try {
    await storeConsumedOAuthState(
      callbackContext.state,
      callbackContext.providerId,
      redirectURL
    );
  } catch (error) {
    console.error("Failed to store consumed OAuth callback state", error);
  }
}

export async function GET(request: Request) {
  const duplicateResponse = await handleDuplicateOAuthCallback(request);
  if (duplicateResponse) {
    return duplicateResponse;
  }

  await ensureReplayableOAuthState(request);

  const auth = createAuth(resolveAuthBaseURL(request));
  const response = await toNextJsHandler(auth).GET(request);
  await rememberSuccessfulOAuthCallback(request, response);
  return response;
}

export function POST(request: Request) {
  const auth = createAuth(resolveAuthBaseURL(request));
  return toNextJsHandler(auth).POST(request);
}
