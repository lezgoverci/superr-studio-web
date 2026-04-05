import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { checkLevelUp } from "@/lib/hub/content";
import {
  getHubMemberProfile,
  updateMemberProfile,
} from "@/lib/hub/member-profiles";
import { getHubProgressResponse } from "@/lib/hub/progress";
import {
  getAuthenticatedHubUser,
  unauthorizedHubResponse,
} from "@/lib/hub/request";
import type { HubLevelCheckResponse, MemberLevel } from "@/lib/hub/types";

async function buildLevelCheck(userId: string): Promise<HubLevelCheckResponse> {
  const [profile, progress, userWorkflows] = await Promise.all([
    getHubMemberProfile(userId),
    getHubProgressResponse(userId),
    db.query.workflows.findMany({
      where: eq(workflows.userId, userId),
      columns: { id: true, name: true },
    }),
  ]);

  const realWorkflows = userWorkflows.filter(
    (workflow) => workflow.name !== "__current__"
  );

  return checkLevelUp({
    profile,
    tracks: progress.tracks,
    workflowCount: realWorkflows.length,
  });
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedHubUser(request);

    if (!user?.id) {
      return unauthorizedHubResponse();
    }

    const check = await buildLevelCheck(user.id);
    return NextResponse.json(check);
  } catch (error) {
    console.error("[hub/level] Failed to check level:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to check level",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedHubUser(request);

    if (!user?.id) {
      return unauthorizedHubResponse();
    }

    const check = await buildLevelCheck(user.id);

    if (!check.eligible || check.nextLevel === null) {
      return NextResponse.json({
        ...check,
        leveledUp: false,
      });
    }

    await updateMemberProfile(user.id, {
      level: check.nextLevel as MemberLevel,
    });

    const refreshed = await buildLevelCheck(user.id);

    return NextResponse.json({
      ...refreshed,
      leveledUp: true,
    });
  } catch (error) {
    console.error("[hub/level] Failed to level up:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to level up",
      },
      { status: 500 }
    );
  }
}
