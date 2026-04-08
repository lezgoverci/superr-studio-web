import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { isAiGatewayManagedKeysEnabled } from "./ai-gateway/config";
import { db } from "./db";
import {
  accounts,
  integrations,
  sessions,
  users,
  verifications,
  workflowExecutionLogs,
  workflowExecutions,
  workflowExecutionsRelations,
  workflows,
} from "./db/schema";

const WHOP_PROVIDER_ID = "whop";
const VERCEL_PROVIDER_ID = "vercel";

const WHOP_AUTHORIZATION_URL = "https://api.whop.com/oauth/authorize";
const WHOP_TOKEN_URL = "https://api.whop.com/oauth/token";
const WHOP_USER_INFO_URL = "https://api.whop.com/oauth/userinfo";

const VERCEL_AUTHORIZATION_URL = "https://vercel.com/oauth/authorize";
const VERCEL_TOKEN_URL = "https://api.vercel.com/login/oauth/token";
const VERCEL_USER_INFO_URL = "https://api.vercel.com/login/oauth/userinfo";
const DEFAULT_LOCAL_AUTH_URL = "http://localhost:3000";
const LOCAL_TRUSTED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
];

type OAuthTokens = {
  accessToken?: string;
};

type WhopProfile = {
  sub?: string;
  id?: string;
  user_id?: string;
  email?: string;
  preferred_username?: string;
  username?: string;
  name?: string;
  image?: string;
  picture?: string;
  avatar?: string;
  avatar_url?: string;
  email_verified?: boolean;
};

// Construct schema object for drizzle adapter
const schema = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
  workflows,
  workflowExecutions,
  workflowExecutionLogs,
  workflowExecutionsRelations,
  integrations,
};

function normalizeBaseURL(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return;
  }
}

function getConfiguredBaseURL() {
  return (
    normalizeBaseURL(process.env.BETTER_AUTH_URL) ||
    normalizeBaseURL(process.env.NEXT_PUBLIC_APP_URL) ||
    (process.env.VERCEL_URL
      ? normalizeBaseURL(`https://${process.env.VERCEL_URL}`)
      : undefined) ||
    DEFAULT_LOCAL_AUTH_URL
  );
}

export function resolveAuthBaseURL(request: Request) {
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();

  if (forwardedHost && forwardedProto) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  try {
    return new URL(request.url).origin;
  } catch {
    return getConfiguredBaseURL();
  }
}

function getTrustedOrigins(baseURL?: string) {
  return Array.from(
    new Set(
      [...LOCAL_TRUSTED_ORIGINS, getConfiguredBaseURL(), baseURL].filter(
        (value): value is string => Boolean(value)
      )
    )
  );
}

function createOAuthNonce() {
  return crypto.randomUUID().replaceAll("-", "");
}

function getAccessToken(tokens: OAuthTokens) {
  const accessToken = tokens.accessToken?.trim();
  if (!accessToken) {
    throw new Error("Missing Whop access token.");
  }
  return accessToken;
}

function getWhopUserId(profile: WhopProfile) {
  const id = profile.sub || profile.id || profile.user_id;
  if (!id?.trim()) {
    throw new Error("Whop user identifier is missing.");
  }
  return id;
}

function resolveWhopUserEmail(profile: WhopProfile, userId: string) {
  if (profile.email?.trim()) {
    return profile.email;
  }
  // Better Auth expects an email for social accounts.
  return `${userId}@users.whop.local`;
}

async function fetchWhopProfile(accessToken: string): Promise<WhopProfile> {
  const response = await fetch(WHOP_USER_INFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to fetch Whop user profile: ${message}`);
  }

  const profile = (await response.json()) as WhopProfile;
  return profile;
}

async function getWhopUserInfo(tokens: OAuthTokens) {
  const accessToken = getAccessToken(tokens);
  const profile = await fetchWhopProfile(accessToken);
  const userId = getWhopUserId(profile);

  return {
    id: userId,
    email: resolveWhopUserEmail(profile, userId),
    name: profile.name || profile.preferred_username || profile.username,
    emailVerified: profile.email_verified ?? true,
    image:
      profile.picture || profile.image || profile.avatar || profile.avatar_url,
  };
}

// Build plugins array conditionally
const plugins = [
  genericOAuth({
    config: [
      {
        providerId: WHOP_PROVIDER_ID,
        clientId: process.env.WHOP_CLIENT_ID || "",
        clientSecret: process.env.WHOP_CLIENT_SECRET || "",
        authorizationUrl: WHOP_AUTHORIZATION_URL,
        tokenUrl: WHOP_TOKEN_URL,
        userInfoUrl: WHOP_USER_INFO_URL,
        scopes: ["openid", "email", "profile"],
        authorizationUrlParams: () => ({
          nonce: createOAuthNonce(),
        }),
        pkce: true,
        getUserInfo: async (tokens: OAuthTokens) => getWhopUserInfo(tokens),
      },
      ...(process.env.VERCEL_CLIENT_ID
        ? [
            {
              providerId: VERCEL_PROVIDER_ID,
              clientId: process.env.VERCEL_CLIENT_ID,
              clientSecret: process.env.VERCEL_CLIENT_SECRET || "",
              authorizationUrl: VERCEL_AUTHORIZATION_URL,
              tokenUrl: VERCEL_TOKEN_URL,
              userInfoUrl: VERCEL_USER_INFO_URL,
              // Include read-write:team scope when AI Gateway User Keys is enabled
              // This grants APIKey and APIKeyAiGateway permissions for creating user keys
              scopes: isAiGatewayManagedKeysEnabled()
                ? ["openid", "email", "profile", "read-write:team"]
                : ["openid", "email", "profile"],
              pkce: true,
              getUserInfo: async (tokens: OAuthTokens) => {
                const response = await fetch(VERCEL_USER_INFO_URL, {
                  headers: {
                    Authorization: `Bearer ${tokens.accessToken}`,
                  },
                });
                const profile = await response.json();
                return {
                  id: profile.sub,
                  email: profile.email,
                  name: profile.name ?? profile.preferred_username,
                  emailVerified: profile.email_verified ?? true,
                  image: profile.picture,
                };
              },
            },
          ]
        : []),
    ],
  }),
];

export function createAuth(baseURL = getConfiguredBaseURL()) {
  return betterAuth({
    baseURL,
    trustedOrigins: getTrustedOrigins(baseURL),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    plugins,
  });
}

export const auth = createAuth();
