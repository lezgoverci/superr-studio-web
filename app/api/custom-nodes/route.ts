import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createCustomNodeDefinition,
  listCustomNodesForUser,
  setCustomNodeSecrets,
} from "@/lib/db/custom-nodes";

type CreateCustomNodeRequest = {
  name?: string;
  description?: string;
  runtime?: string;
  configSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  secretSchema?: Record<string, unknown> | null;
  code?: string;
  changelog?: string;
  secrets?: Record<string, string>;
};

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nodes = await listCustomNodesForUser(session.user.id);

    return NextResponse.json(nodes);
  } catch (error) {
    console.error("[custom-nodes] Failed to list custom nodes:", error);
    return NextResponse.json(
      { error: "Failed to list custom nodes" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request
      .json()
      .catch(() => null)) as CreateCustomNodeRequest | null;

    const name = body?.name?.trim();
    const code = body?.code?.trim();

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (!code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }

    const created = await createCustomNodeDefinition({
      userId: session.user.id,
      name,
      description: body?.description,
      runtime: body?.runtime,
      configSchema: body?.configSchema ?? null,
      outputSchema: body?.outputSchema ?? null,
      secretSchema: body?.secretSchema ?? null,
      code,
      changelog: body?.changelog,
    });

    if (body?.secrets && Object.keys(body.secrets).length > 0) {
      await setCustomNodeSecrets({
        userId: session.user.id,
        customNodeId: created.id,
        secrets: body.secrets,
      });
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[custom-nodes] Failed to create custom node:", error);
    return NextResponse.json(
      { error: "Failed to create custom node" },
      { status: 500 }
    );
  }
}
