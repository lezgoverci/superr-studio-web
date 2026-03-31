import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertMemberProgressItem } from "@/lib/hub/member-profiles";
import { getHubProgressResponse } from "@/lib/hub/progress";
import {
  getAuthenticatedHubUser,
  unauthorizedHubResponse,
} from "@/lib/hub/request";

const ProgressMutationSchema = z.object({
  trackId: z.string().min(1).max(100),
  taskId: z.string().min(1).max(100),
  completed: z.boolean().default(true),
});

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedHubUser(request);

    if (!user?.id) {
      return unauthorizedHubResponse();
    }

    const progress = await getHubProgressResponse(user.id, {
      name: user.name ?? null,
      image: user.image ?? null,
    });

    return NextResponse.json(progress);
  } catch (error) {
    console.error("[hub/progress] Failed to load progress:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load progress",
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

    const rawBody = await request.json();
    const parsed = ProgressMutationSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid progress payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const body = parsed.data;

    await upsertMemberProgressItem({
      userId: user.id,
      trackId: body.trackId,
      taskId: body.taskId,
      completedAt: body.completed ? new Date() : null,
    });

    const progress = await getHubProgressResponse(user.id, {
      name: user.name ?? null,
      image: user.image ?? null,
    });

    return NextResponse.json(progress);
  } catch (error) {
    console.error("[hub/progress] Failed to update progress:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update progress",
      },
      { status: 500 }
    );
  }
}
