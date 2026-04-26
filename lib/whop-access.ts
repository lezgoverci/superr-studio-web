import "server-only";

import { getWhopAccountIdentity } from "@/lib/hub/member-profiles";
import type { HubWhopAccess } from "@/lib/hub/types";

const WHOP_API_BASE_URL = "https://api.whop.com";

type WhopMemberRecord = {
  access_level?: string;
  most_recent_action?: string | null;
  status?: string | null;
  user?: {
    id?: string;
  } | null;
};

type WhopMembersResponse = {
  data?: WhopMemberRecord[];
};

type WhopMembersLookupResult =
  | {
      ok: true;
      payload: WhopMembersResponse;
    }
  | {
      ok: false;
      message: string;
      status: number;
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

function getWhopCompanyId(): string | null {
  const value = process.env.WHOP_COMPANY_ID?.trim();
  return value || null;
}

function resolveAccessLevel(member: WhopMemberRecord | null): string | null {
  const accessLevel = member?.access_level;
  return typeof accessLevel === "string" && accessLevel.trim()
    ? accessLevel
    : null;
}

function hasJoinedWhopCommunity(member: WhopMemberRecord | null) {
  return member?.status === "joined";
}

function findWhopMemberRecord(
  response: WhopMembersResponse,
  whopUserId: string
): WhopMemberRecord | null {
  if (!Array.isArray(response.data)) {
    return null;
  }

  return (
    response.data.find((member) => member.user?.id === whopUserId) ??
    response.data[0] ??
    null
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

async function fetchWhopMembers(params: {
  apiKey: string;
  companyId?: string | null;
  whopUserId: string;
}): Promise<WhopMembersLookupResult> {
  const membersUrl = new URL("/api/v1/members", WHOP_API_BASE_URL);
  membersUrl.searchParams.set("user_id", params.whopUserId);

  if (params.companyId) {
    membersUrl.searchParams.set("company_id", params.companyId);
  }

  const response = await fetch(membersUrl, {
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.ok) {
    return {
      ok: true,
      payload: (await response.json()) as WhopMembersResponse,
    };
  }

  return {
    ok: false,
    status: response.status,
    message: await response.text().catch(() => ""),
  };
}

function shouldRetryWithoutCompanyId(result: WhopMembersLookupResult) {
  if (result.ok) {
    return false;
  }

  return result.status === 400 || result.status === 403;
}

export async function getWhopCommunityAccess(
  userId: string
): Promise<HubWhopAccess> {
  const joinUrl = resolveWhopCommunityUrl();
  const apiKey = getWhopApiKey();
  const companyId = getWhopCompanyId();

  const identity = await getWhopAccountIdentity(userId);

  if (!identity?.accountId) {
    return buildUnavailableAccess({
      joinUrl,
      message:
        "Superr could not find your Whop account link. Sign out, then try connecting with Whop again.",
    });
  }

  if (!apiKey) {
    return buildUnavailableAccess({
      joinUrl,
      message:
        "Whop access verification is not configured because WHOP_API_KEY is missing.",
    });
  }

  try {
    let membersResult = await fetchWhopMembers({
      apiKey,
      companyId,
      whopUserId: identity.accountId,
    });

    if (
      companyId &&
      !membersResult.ok &&
      shouldRetryWithoutCompanyId(membersResult)
    ) {
      console.warn(
        "[whop-access] Retrying member lookup without company filter",
        membersResult.status,
        membersResult.message
      );

      membersResult = await fetchWhopMembers({
        apiKey,
        whopUserId: identity.accountId,
      });
    }

    if (membersResult.ok) {
      const member = findWhopMemberRecord(
        membersResult.payload,
        identity.accountId
      );
      const accessLevel = resolveAccessLevel(member);

      if (hasJoinedWhopCommunity(member)) {
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

    const failedLookup = membersResult;
    console.error(
      "[whop-access] Failed to verify Whop community membership",
      failedLookup.status,
      failedLookup.message
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
