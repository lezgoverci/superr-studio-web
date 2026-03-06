import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { executeCustomNodeRuntime } from "@/lib/custom-nodes/runtime";

type TestCustomNodeRequest = {
  payload?: Record<string, unknown>;
  version?: number;
  timeoutMs?: number;
  sandboxType?: string;
  oidcToken?: string;
  vercelSandboxToken?: string;
};

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
      .catch(() => null)) as TestCustomNodeRequest | null;
    const { customNodeId } = await context.params;

    const result = await executeCustomNodeRuntime({
      userId: session.user.id,
      customNodeId,
      ...(typeof body?.version === "number" ? { version: body.version } : {}),
      payload:
        body?.payload && typeof body.payload === "object" ? body.payload : {},
      timeoutMs: body?.timeoutMs,
      sandboxType: body?.sandboxType,
      oidcToken: body?.oidcToken,
      vercelSandboxToken: body?.vercelSandboxToken,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[custom-nodes] Failed to test custom node:", error);
    return NextResponse.json(
      { error: "Failed to test custom node" },
      { status: 500 }
    );
  }
}
