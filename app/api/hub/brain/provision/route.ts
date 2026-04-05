import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getHubMemberProfile,
  updateMemberProfile,
} from "@/lib/hub/member-profiles";
import { getBrainState, provisionBrain } from "@/lib/hub/notebooklm-service";
import {
  getAuthenticatedHubUser,
  unauthorizedHubResponse,
} from "@/lib/hub/request";

const ProvisionSchema = z.object({
  force: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedHubUser(request);

    if (!user?.id) {
      return unauthorizedHubResponse();
    }

    const rawBody = await request
      .json()
      .catch(() => ({}) satisfies z.input<typeof ProvisionSchema>);
    const parsed = ProvisionSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid brain provision payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const profile = await getHubMemberProfile(user.id, {
      name: user.name ?? null,
      image: user.image ?? null,
    });

    if (profile.notebooklmNotebookId && !parsed.data.force) {
      return NextResponse.json(await getBrainState(profile));
    }

    const provisioned = await provisionBrain(profile);
    const updatedProfile = await updateMemberProfile(user.id, {
      notebooklmNotebookId: provisioned.notebookId,
    });

    return NextResponse.json({
      ...provisioned.brain,
      notebookId: updatedProfile.notebooklmNotebookId,
    });
  } catch (error) {
    console.error("[hub/brain] Failed to provision brain:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to provision brain",
      },
      { status: 500 }
    );
  }
}
