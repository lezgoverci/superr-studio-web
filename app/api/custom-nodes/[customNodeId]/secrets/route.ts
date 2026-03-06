import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setCustomNodeSecrets } from "@/lib/db/custom-nodes";

type SetCustomNodeSecretsRequest = {
  secrets?: Record<string, string>;
};

export async function PUT(
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
      .catch(() => null)) as SetCustomNodeSecretsRequest | null;
    const secrets = body?.secrets;

    if (!(secrets && typeof secrets === "object")) {
      return NextResponse.json(
        { error: "secrets must be an object" },
        { status: 400 }
      );
    }

    const { customNodeId } = await context.params;

    const updated = await setCustomNodeSecrets({
      userId: session.user.id,
      customNodeId,
      secrets,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Custom node not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      updatedKeys: Object.keys(secrets),
    });
  } catch (error) {
    console.error(
      "[custom-nodes] Failed to update custom node secrets:",
      error
    );
    return NextResponse.json(
      { error: "Failed to update custom node secrets" },
      { status: 500 }
    );
  }
}
