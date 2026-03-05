import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { searchMarketplace } from "@/lib/skills/skill-installer";

export async function GET(req: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  try {
    const results = await searchMarketplace(query);
    return NextResponse.json({ skills: results });
  } catch (error) {
    console.error("[skills] Failed to search marketplace:", error);
    return NextResponse.json(
      { error: "Failed to search marketplace" },
      { status: 500 }
    );
  }
}
