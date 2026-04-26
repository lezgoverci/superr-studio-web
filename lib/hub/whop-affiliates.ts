import { HUB_MIGRATION_REQUIRED_MESSAGE } from "./errors";
import {
  getHubMemberProfile,
  getWhopAccountIdentity,
  updateMemberProfile,
} from "./member-profiles";
import type { HubEarnResponse } from "./types";

const WHOP_API_BASE_URL = "https://api.whop.com/api/v1";

type WhopAffiliate = {
  id: string;
  active_members_count?: number;
  monthly_recurring_revenue_usd?: string;
  total_referral_earnings_usd?: string;
  total_referrals_count?: number;
  total_revenue_usd?: string;
  user?: {
    id?: string;
    username?: string | null;
    name?: string | null;
  } | null;
};

function getWhopAffiliateConfig() {
  return {
    apiKey: process.env.WHOP_API_KEY?.trim(),
    companyId: process.env.WHOP_COMPANY_ID?.trim(),
    baseUrl: process.env.WHOP_AFFILIATE_BASE_URL?.trim(),
  };
}

function isWhopAffiliateConfigured() {
  const config = getWhopAffiliateConfig();
  return Boolean(config.apiKey && config.companyId && config.baseUrl);
}

function parseUsdAmount(value: string | null | undefined) {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildShareLink(baseUrl: string, username: string | null | undefined) {
  if (!username) {
    return null;
  }

  if (baseUrl.includes("{username}")) {
    return baseUrl.replaceAll("{username}", encodeURIComponent(username));
  }

  if (baseUrl.endsWith("=") || baseUrl.endsWith("/")) {
    return `${baseUrl}${encodeURIComponent(username)}`;
  }

  if (baseUrl.includes("?")) {
    return `${baseUrl}&ref=${encodeURIComponent(username)}`;
  }

  return `${baseUrl}/${encodeURIComponent(username)}`;
}

async function whopAffiliateCall<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const config = getWhopAffiliateConfig();

  if (!(config.apiKey && config.companyId && config.baseUrl)) {
    throw new Error(
      "Whop affiliate API is not configured. Set WHOP_API_KEY, WHOP_COMPANY_ID, and WHOP_AFFILIATE_BASE_URL."
    );
  }

  const response = await fetch(`${WHOP_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Whop affiliate request failed (${response.status}): ${message}`
    );
  }

  return response.json() as Promise<T>;
}

function mapAffiliateToResponse(
  affiliate: WhopAffiliate,
  configured: boolean,
  baseUrl: string | null | undefined,
  message: string | null = null
): HubEarnResponse {
  return {
    configured,
    affiliateId: affiliate.id,
    username: affiliate.user?.username ?? null,
    shareLink: baseUrl
      ? buildShareLink(baseUrl, affiliate.user?.username)
      : null,
    totals: {
      earningsUsd: parseUsdAmount(affiliate.total_referral_earnings_usd),
      revenueUsd: parseUsdAmount(affiliate.total_revenue_usd),
      monthlyRecurringRevenueUsd: parseUsdAmount(
        affiliate.monthly_recurring_revenue_usd
      ),
      referrals: affiliate.total_referrals_count ?? 0,
      activeMembers: affiliate.active_members_count ?? 0,
    },
    message,
  };
}

async function ensureAffiliate(userId: string) {
  const config = getWhopAffiliateConfig();

  if (!(config.apiKey && config.companyId && config.baseUrl)) {
    return null;
  }

  const profile = await getHubMemberProfile(userId);
  const identity = await getWhopAccountIdentity(userId);

  if (!identity?.accountId) {
    throw new Error("The signed-in user is missing a Whop account identifier.");
  }

  let affiliate: WhopAffiliate | null = null;

  if (profile.whopAffiliateId) {
    try {
      affiliate = await whopAffiliateCall<WhopAffiliate>(
        `/affiliates/${encodeURIComponent(profile.whopAffiliateId)}`
      );
    } catch (error) {
      console.error("[hub/earn] Failed to retrieve existing affiliate:", error);
    }
  }

  if (!affiliate) {
    affiliate = await whopAffiliateCall<WhopAffiliate>("/affiliates", {
      method: "POST",
      body: JSON.stringify({
        company_id: config.companyId,
        user_identifier: identity.accountId,
      }),
    });
  }

  if (affiliate.id !== profile.whopAffiliateId) {
    try {
      await updateMemberProfile(userId, {
        whopAffiliateId: affiliate.id,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === HUB_MIGRATION_REQUIRED_MESSAGE
      ) {
        console.warn(
          "[hub/earn] Skipping affiliate ID persistence until Hub migrations are applied."
        );
      } else {
        throw error;
      }
    }
  }

  return affiliate;
}

export async function getEarnDashboard(
  userId: string
): Promise<HubEarnResponse> {
  const config = getWhopAffiliateConfig();

  if (!isWhopAffiliateConfigured()) {
    return {
      configured: false,
      affiliateId: null,
      username: null,
      shareLink: null,
      totals: {
        earningsUsd: 0,
        revenueUsd: 0,
        monthlyRecurringRevenueUsd: 0,
        referrals: 0,
        activeMembers: 0,
      },
      message:
        "Whop affiliate credentials are not configured yet. Add WHOP_API_KEY, WHOP_COMPANY_ID, and WHOP_AFFILIATE_BASE_URL to enable live earnings data.",
    };
  }

  const affiliate = await ensureAffiliate(userId);

  if (!affiliate) {
    return {
      configured: false,
      affiliateId: null,
      username: null,
      shareLink: null,
      totals: {
        earningsUsd: 0,
        revenueUsd: 0,
        monthlyRecurringRevenueUsd: 0,
        referrals: 0,
        activeMembers: 0,
      },
      message: "Affiliate data is unavailable.",
    };
  }

  return mapAffiliateToResponse(affiliate, true, config.baseUrl);
}
