import { NextResponse } from "next/server";
import { getHubMemberProfile } from "@/lib/hub/member-profiles";
import { getBrainState } from "@/lib/hub/notebooklm-service";
import {
  getAuthenticatedHubUser,
  unauthorizedHubResponse,
} from "@/lib/hub/request";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedHubUser(request);

    if (!user?.id) {
      return unauthorizedHubResponse();
    }

    const profile = await getHubMemberProfile(user.id, {
      name: user.name ?? null,
      image: user.image ?? null,
    });
    const brain = await getBrainState(profile);

    return NextResponse.json(brain);
  } catch (error) {
    console.error("[hub/brain] Failed to load brain state:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load brain state",
      },
      { status: 500 }
    );
  }
}
