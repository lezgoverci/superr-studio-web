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
const WHOP_API_BASE_URL = "https://api.whop.com";

const VERCEL_AUTHORIZATION_URL = "https://vercel.com/oauth/authorize";
const VERCEL_TOKEN_URL = "https://api.vercel.com/login/oauth/token";
const VERCEL_USER_INFO_URL = "https://api.vercel.com/login/oauth/userinfo";

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

type WhopAccessResponse = {
  has_access?: boolean;
  hasAccess?: boolean;
  access?: boolean;
  valid?: boolean;
  active?: boolean;
  data?: WhopAccessResponse;
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

// Determine the base URL for authentication
// This supports Vercel Preview deployments with dynamic URLs
function getBaseURL() {
  // Priority 1: Explicit BETTER_AUTH_URL (set manually for production/dev)
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL.trim();
  }

  // Priority 2: NEXT_PUBLIC_APP_URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.trim();
  }

  // Priority 3: Check if we're on Vercel (for preview deployments)
  if (process.env.VERCEL_URL) {
    // VERCEL_URL doesn't include protocol, so add it
    // Use https for Vercel deployments (both production and preview)
    return `https://${process.env.VERCEL_URL.trim()}`;
  }

  // Fallback: Local development
  return "http://localhost:3000";
}

function getWhopResourceId() {
  const resourceId = process.env.WHOP_RESOURCE_ID?.trim();
  if (!resourceId) {
    throw new Error("WHOP_RESOURCE_ID is not configured.");
  }
  return resourceId;
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

function hasWhopAccess(response: WhopAccessResponse) {
  const payload = response.data ?? response;
  return (
    payload.has_access === true ||
    payload.hasAccess === true ||
    payload.access === true ||
    payload.valid === true ||
    payload.active === true
  );
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

async function userHasRequiredWhopAccess(
  accessToken: string,
  whopUserId: string,
  resourceId: string
) {
  const encodedUserId = encodeURIComponent(whopUserId);
  const encodedResourceId = encodeURIComponent(resourceId);

  // Whop docs show this as /users/{id}/access/{resource_id}. Keep a fallback path
  // because API versions can vary across environments.
  const candidates = [
    `${WHOP_API_BASE_URL}/api/v1/users/${encodedUserId}/access/${encodedResourceId}`,
    `${WHOP_API_BASE_URL}/api/v5/users/${encodedUserId}/access/${encodedResourceId}`,
    `${WHOP_API_BASE_URL}/users/${encodedUserId}/access/${encodedResourceId}`,
  ];

  for (const url of candidates) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (response.status === 404) {
      continue;
    }

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Failed to verify Whop access: ${message}`);
    }

    const payload = (await response.json()) as WhopAccessResponse;
    return hasWhopAccess(payload);
  }

  throw new Error("Unable to verify Whop access with available endpoints.");
}

async function getWhopUserInfo(tokens: OAuthTokens) {
  const resourceId = getWhopResourceId();
  const accessToken = getAccessToken(tokens);
  const profile = await fetchWhopProfile(accessToken);
  const userId = getWhopUserId(profile);

  const hasAccess = await userHasRequiredWhopAccess(
    accessToken,
    userId,
    resourceId
  );

  if (!hasAccess) {
    throw new Error("Your Whop account does not have required access.");
  }

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

export const auth = betterAuth({
  baseURL: getBaseURL(),
  trustedOrigins: ["http://localhost:3000"],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  plugins,
});
