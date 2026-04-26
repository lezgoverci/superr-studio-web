import { NextResponse } from "next/server";
import { z } from "zod";
import { getHubMemberProfile } from "@/lib/hub/member-profiles";
import { addNotebookUrlSource } from "@/lib/hub/notebooklm-service";
import {
  getAuthenticatedHubUser,
  unauthorizedHubResponse,
} from "@/lib/hub/request";

const AddUrlSourceSchema = z.object({
  url: z.string().url().max(2048),
});

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedHubUser(request);

    if (!user?.id) {
      return unauthorizedHubResponse();
    }

    const rawBody = await request.json();
    const parsed = AddUrlSourceSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid URL source payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const profile = await getHubMemberProfile(user.id, {
      name: user.name ?? null,
      image: user.image ?? null,
    });

    if (!profile.notebooklmNotebookId) {
      return NextResponse.json(
        { error: "Link your Brain before adding sources." },
        { status: 400 }
      );
    }

    const result = await addNotebookUrlSource(profile, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[hub/brain] Failed to add URL source:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to add URL source",
      },
      { status: 500 }
    );
  }
}
