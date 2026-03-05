import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uninstallSkill } from "@/lib/skills/skill-installer";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = (await req.json().catch(() => null)) as {
      agentCwd?: unknown;
    } | null;
    const normalizedAgentCwd =
      typeof body?.agentCwd === "string" && body.agentCwd.trim().length > 0
        ? body.agentCwd.trim()
        : undefined;

    const result = await uninstallSkill(session.user.id, id, {
      agentCwd: normalizedAgentCwd,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[skills] Failed to uninstall skill:", error);
    return NextResponse.json(
      { error: "Failed to uninstall skill" },
      { status: 500 }
    );
  }
}
