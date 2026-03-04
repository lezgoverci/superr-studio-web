import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let prefs = await db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, session.user.id),
    });

    // Auto-create default preferences if none exist
    if (!prefs) {
      const [created] = await db
        .insert(userPreferences)
        .values({ userId: session.user.id })
        .returning();
      prefs = created;
    }

    return NextResponse.json({
      workflowOperationDelayMs: prefs.workflowOperationDelayMs,
    });
  } catch (error) {
    console.error("Failed to get user preferences:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get user preferences",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { workflowOperationDelayMs } = body;

    if (
      typeof workflowOperationDelayMs !== "number" ||
      !Number.isInteger(workflowOperationDelayMs) ||
      workflowOperationDelayMs < 0 ||
      workflowOperationDelayMs > 5000
    ) {
      return NextResponse.json(
        {
          error:
            "workflowOperationDelayMs must be an integer between 0 and 5000",
        },
        { status: 400 }
      );
    }

    // Upsert: insert if not exists, update if exists
    const [updated] = await db
      .insert(userPreferences)
      .values({
        userId: session.user.id,
        workflowOperationDelayMs,
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          workflowOperationDelayMs,
          updatedAt: new Date(),
        },
      })
      .returning();

    return NextResponse.json({
      workflowOperationDelayMs: updated.workflowOperationDelayMs,
    });
  } catch (error) {
    console.error("Failed to update user preferences:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update user preferences",
      },
      { status: 500 }
    );
  }
}
