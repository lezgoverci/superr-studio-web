import { NextResponse } from "next/server";
import { z } from "zod";
import { getHubMemberProfile } from "@/lib/hub/member-profiles";
import { addNotebookTextSource } from "@/lib/hub/notebooklm-service";
import {
  getAuthenticatedHubUser,
  unauthorizedHubResponse,
} from "@/lib/hub/request";

const AddTextSourceSchema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(10_000),
});

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedHubUser(request);

    if (!user?.id) {
      return unauthorizedHubResponse();
    }

    const rawBody = await request.json();
    const parsed = AddTextSourceSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid text source payload",
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
        { error: "Provision the Brain before adding sources." },
        { status: 400 }
      );
    }

    const result = await addNotebookTextSource(profile, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[hub/brain] Failed to add text source:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to add text source",
      },
      { status: 500 }
    );
  }
}
