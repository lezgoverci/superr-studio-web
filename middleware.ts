import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildNextPath,
  isAuthRoute,
  resolvePostAuthRedirect,
} from "@/lib/auth-redirect";

type SessionPayload = {
  user?: {
    id?: string;
  } | null;
};

function hasSessionCookie(request: NextRequest): boolean {
  return getSessionCookie(request.headers) !== null;
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const payload = value as SessionPayload;
  return Boolean(payload.user && typeof payload.user.id === "string");
}

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  if (!hasSessionCookie(request)) {
    return false;
  }

  try {
    const response = await fetch(
      new URL("/api/auth/get-session", request.url),
      {
        headers: {
          cookie: request.headers.get("cookie") ?? "",
        },
        method: "GET",
      }
    );

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as unknown;
    return isSessionPayload(payload);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;
  const authPageRequest = isAuthRoute(pathname);
  const authenticated = await isAuthenticated(request);

  if (authPageRequest) {
    if (!authenticated) {
      return NextResponse.next();
    }

    const redirectTarget = resolvePostAuthRedirect(
      nextUrl.searchParams.get("next")
    );
    return NextResponse.redirect(new URL(redirectTarget, request.url));
  }

  if (authenticated) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", buildNextPath(pathname, nextUrl.search));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
