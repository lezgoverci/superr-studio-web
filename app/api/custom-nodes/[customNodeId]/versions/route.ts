import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createCustomNodeVersion,
  listCustomNodeVersionsForUser,
} from "@/lib/db/custom-nodes";

type CreateCustomNodeVersionRequest = {
  code?: string;
  changelog?: string;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ customNodeId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { customNodeId } = await context.params;

    const versions = await listCustomNodeVersionsForUser(
      session.user.id,
      customNodeId
    );

    return NextResponse.json(versions);
  } catch (error) {
    console.error("[custom-nodes] Failed to list custom node versions:", error);
    return NextResponse.json(
      { error: "Failed to list custom node versions" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ customNodeId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request
      .json()
      .catch(() => null)) as CreateCustomNodeVersionRequest | null;
    const code = body?.code?.trim();

    if (!code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }

    const { customNodeId } = await context.params;

    const created = await createCustomNodeVersion({
      userId: session.user.id,
      customNodeId,
      code,
      changelog: body?.changelog,
    });

    if (!created) {
      return NextResponse.json(
        { error: "Custom node not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error(
      "[custom-nodes] Failed to create custom node version:",
      error
    );
    return NextResponse.json(
      { error: "Failed to create custom node version" },
      { status: 500 }
    );
  }
}
