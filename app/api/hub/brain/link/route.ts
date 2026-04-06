import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getHubMemberProfile,
  updateMemberProfile,
} from "@/lib/hub/member-profiles";
import { linkBrain } from "@/lib/hub/notebooklm-service";
import {
  getAuthenticatedHubUser,
  unauthorizedHubResponse,
} from "@/lib/hub/request";

const LinkBrainSchema = z.object({
  notebookIdOrUrl: z.string().min(1).max(2048),
});

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedHubUser(request);

    if (!user?.id) {
      return unauthorizedHubResponse();
    }

    const rawBody = await request.json();
    const parsed = LinkBrainSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid Brain link payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const profile = await getHubMemberProfile(user.id, {
      name: user.name ?? null,
      image: user.image ?? null,
    });
    const linked = await linkBrain(profile, parsed.data);
    const updatedProfile = await updateMemberProfile(user.id, {
      notebooklmNotebookId: linked.notebookId,
    });

    return NextResponse.json({
      ...linked.brain,
      notebookId: updatedProfile.notebooklmNotebookId,
    });
  } catch (error) {
    console.error("[hub/brain] Failed to link brain:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to link Brain",
      },
      { status: 500 }
    );
  }
}
