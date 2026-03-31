import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function getAuthenticatedHubUser(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return session?.user ?? null;
}

export function unauthorizedHubResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
