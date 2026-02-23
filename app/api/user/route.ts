import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accounts, users } from "@/lib/db/schema";

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userData = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: {
        id: true,
        name: true,
        email: true,
        image: true,
        isAnonymous: true,
      },
    });

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prefer the primary Whop identity account.
    const userAccount = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.userId, session.user.id),
        eq(accounts.providerId, "whop")
      ),
      columns: {
        providerId: true,
      },
    });

    return NextResponse.json({
      ...userData,
      providerId: userAccount?.providerId ?? null,
    });
  } catch (error) {
    console.error("Failed to get user:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to get user",
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

    // Profile data is managed by Whop OAuth.
    return NextResponse.json(
      { error: "Profile updates are managed by Whop" },
      { status: 403 }
    );
  } catch (error) {
    console.error("Failed to update user:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update user",
      },
      { status: 500 }
    );
  }
}
