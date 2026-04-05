import { NextResponse } from "next/server";
import {
  getAuthenticatedHubUser,
  unauthorizedHubResponse,
} from "@/lib/hub/request";
import { getEarnDashboard } from "@/lib/hub/whop-affiliates";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedHubUser(request);

    if (!user?.id) {
      return unauthorizedHubResponse();
    }

    const dashboard = await getEarnDashboard(user.id);
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("[hub/earn] Failed to load earnings:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load earnings",
      },
      { status: 500 }
    );
  }
}
