import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserSkills } from "@/lib/db/user-skills";
import { installSkillFromSource } from "@/lib/skills/skill-installer";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const skills = await getUserSkills(session.user.id);
    return NextResponse.json(skills);
  } catch (error) {
    console.error("[skills] Failed to list skills:", error);
    return NextResponse.json(
      { error: "Failed to list skills" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { source, skillName, agentCwd } = body;

    if (!source || typeof source !== "string") {
      return NextResponse.json(
        { error: "source is required and must be a string" },
        { status: 400 }
      );
    }

    const normalizedSkillName =
      typeof skillName === "string" && skillName.trim().length > 0
        ? skillName.trim()
        : undefined;
    const normalizedAgentCwd =
      typeof agentCwd === "string" && agentCwd.trim().length > 0
        ? agentCwd.trim()
        : undefined;

    const result = await installSkillFromSource(session.user.id, source, {
      skillName: normalizedSkillName,
      agentCwd: normalizedAgentCwd,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[skills] Failed to install skill:", error);
    return NextResponse.json(
      { error: "Failed to install skill" },
      { status: 500 }
    );
  }
}
