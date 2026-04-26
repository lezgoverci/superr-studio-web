import { NextResponse } from "next/server";
import {
  getAuthenticatedHubUser,
  unauthorizedHubResponse,
} from "@/lib/hub/request";
import { getWhopCommunityAccess } from "@/lib/whop-access";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedHubUser(request);

    if (!user?.id) {
      return unauthorizedHubResponse();
    }

    const access = await getWhopCommunityAccess(user.id);
    return NextResponse.json(access);
  } catch (error) {
    console.error("[hub/access] Failed to load Whop access:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load Whop access",
      },
      { status: 500 }
    );
  }
}
