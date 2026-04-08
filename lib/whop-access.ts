import { getWhopAccountIdentity } from "@/lib/hub/member-profiles";
import type { HubWhopAccess } from "@/lib/hub/types";

const WHOP_API_BASE_URL = "https://api.whop.com";

type WhopAccessResponse = {
  access_level?: string;
  accessLevel?: string;
  has_access?: boolean;
  hasAccess?: boolean;
  access?: boolean;
  valid?: boolean;
  active?: boolean;
  data?: WhopAccessResponse;
};

function resolveWhopCommunityUrl(): string | null {
  const value = process.env.WHOP_COMMUNITY_URL?.trim();
  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function getWhopApiKey(): string | null {
  const value = process.env.WHOP_API_KEY?.trim();
  return value || null;
}

function getWhopResourceId(): string | null {
  const value = process.env.WHOP_RESOURCE_ID?.trim();
  return value || null;
}

function unwrapAccessPayload(response: WhopAccessResponse): WhopAccessResponse {
  return response.data ?? response;
}

function resolveAccessLevel(response: WhopAccessResponse): string | null {
  const payload = unwrapAccessPayload(response);
  const accessLevel = payload.access_level ?? payload.accessLevel;
  return typeof accessLevel === "string" && accessLevel.trim()
    ? accessLevel
    : null;
}

function hasWhopAccess(response: WhopAccessResponse): boolean {
  const payload = unwrapAccessPayload(response);
  return (
    payload.has_access === true ||
    payload.hasAccess === true ||
    payload.access === true ||
    payload.valid === true ||
    payload.active === true
  );
}

function buildUnavailableAccess(params: {
  joinUrl: string | null;
  message: string;
}): HubWhopAccess {
  return {
    status: "unavailable",
    hasAccess: false,
    accessLevel: null,
    joinUrl: params.joinUrl,
    message: params.message,
  };
}

function buildMissingAccess(params: {
  joinUrl: string | null;
  accessLevel?: string | null;
}): HubWhopAccess {
  if (!params.joinUrl) {
    return buildUnavailableAccess({
      joinUrl: null,
      message:
        "Superr cannot verify your Whop access because the community join URL is not configured yet.",
    });
  }

  return {
    status: "missing_access",
    hasAccess: false,
    accessLevel: params.accessLevel ?? null,
    joinUrl: params.joinUrl,
    message:
      "Your Superr account is ready. Join the Whop community to unlock the workspace.",
  };
}

export function isWhopCommunityAccessActive(access: HubWhopAccess | null) {
  return access?.status === "active" && access.hasAccess;
}

export async function getWhopCommunityAccess(
  userId: string
): Promise<HubWhopAccess> {
  const joinUrl = resolveWhopCommunityUrl();
  const apiKey = getWhopApiKey();
  const resourceId = getWhopResourceId();

  const identity = await getWhopAccountIdentity(userId);

  if (!identity?.accountId) {
    return buildUnavailableAccess({
      joinUrl,
      message:
        "Superr could not find your Whop account link. Sign out, then try connecting with Whop again.",
    });
  }

  if (!resourceId) {
    return buildUnavailableAccess({
      joinUrl,
      message:
        "Whop access verification is not configured because WHOP_RESOURCE_ID is missing.",
    });
  }

  if (!apiKey) {
    return buildUnavailableAccess({
      joinUrl,
      message:
        "Whop access verification is not configured because WHOP_API_KEY is missing.",
    });
  }

  const encodedUserId = encodeURIComponent(identity.accountId);
  const encodedResourceId = encodeURIComponent(resourceId);

  try {
    const response = await fetch(
      `${WHOP_API_BASE_URL}/api/v1/users/${encodedUserId}/access/${encodedResourceId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (response.ok) {
      const payload = (await response.json()) as WhopAccessResponse;
      const accessLevel = resolveAccessLevel(payload);

      if (hasWhopAccess(payload)) {
        return {
          status: "active",
          hasAccess: true,
          accessLevel,
          joinUrl,
          message: null,
        };
      }

      return buildMissingAccess({ joinUrl, accessLevel });
    }

    if (response.status === 403 || response.status === 404) {
      return buildMissingAccess({ joinUrl });
    }

    const message = await response.text().catch(() => "");
    console.error(
      "[whop-access] Failed to verify Whop access",
      response.status,
      message
    );

    return buildUnavailableAccess({
      joinUrl,
      message:
        "Superr could not verify your Whop access right now. Try again in a moment.",
    });
  } catch (error) {
    console.error("[whop-access] Unexpected access verification error", error);
    return buildUnavailableAccess({
      joinUrl,
      message:
        "Superr could not verify your Whop access right now. Try again in a moment.",
    });
  }
}
