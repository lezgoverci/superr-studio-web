import { NextResponse } from "next/server";
import type { HubWhopAccess } from "@/lib/hub/types";
import { getWhopCommunityAccess } from "@/lib/whop-access";

export const WHOP_ACCESS_REQUIRED_CODE = "WHOP_ACCESS_REQUIRED";

export function buildWhopAccessRequiredResponse(
  access: HubWhopAccess
): NextResponse {
  return NextResponse.json(
    {
      code: WHOP_ACCESS_REQUIRED_CODE,
      error:
        access.message ??
        "Whop community access is required to use this Superr feature.",
      joinUrl: access.joinUrl,
      status: access.status,
    },
    { status: 403 }
  );
}

export async function getWhopAccessGuardResponse(userId: string) {
  const access = await getWhopCommunityAccess(userId);
  if (access.status === "active" && access.hasAccess) {
    return null;
  }

  return buildWhopAccessRequiredResponse(access);
}
