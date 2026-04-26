import { NextResponse } from "next/server";
import { isAiGatewayManagedKeysEnabled } from "@/lib/ai-gateway/config";
import { createAuth, resolveAuthBaseURL } from "@/lib/auth";
import { getWhopAccessGuardResponse } from "@/lib/whop-access-guard";

const DEFAULT_CALLBACK_PATH = "/app/settings";

function resolveCallbackPath(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_CALLBACK_PATH;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    return DEFAULT_CALLBACK_PATH;
  }

  return trimmed;
}

export async function POST(request: Request) {
  if (!isAiGatewayManagedKeysEnabled()) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 403 });
  }

  const auth = createAuth(resolveAuthBaseURL(request));
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const whopAccessGuard = await getWhopAccessGuardResponse(session.user.id);
  if (whopAccessGuard) {
    return whopAccessGuard;
  }

  const body = await request.json().catch(() => ({}));
  const callbackURL = resolveCallbackPath(body.callbackURL);

  try {
    const response = await auth.api.oAuth2LinkAccount({
      body: {
        providerId: "vercel",
        callbackURL,
        errorCallbackURL: callbackURL,
      },
      headers: request.headers,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start Vercel OAuth flow",
      },
      { status: 500 }
    );
  }
}
