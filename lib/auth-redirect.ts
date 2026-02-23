const DEFAULT_AUTH_REDIRECT = "/app";
const AUTH_ROUTES = new Set(["/login", "/signup"]);
const LOCAL_URL_BASE = "http://localhost";

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.has(pathname);
}

export function buildNextPath(pathname: string, search: string): string {
  return `${pathname}${search}`;
}

export function resolvePostAuthRedirect(
  nextPath: string | null | undefined
): string {
  if (!nextPath) {
    return DEFAULT_AUTH_REDIRECT;
  }

  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT;
  }

  let parsed: URL;
  try {
    parsed = new URL(nextPath, LOCAL_URL_BASE);
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }

  if (parsed.origin !== LOCAL_URL_BASE) {
    return DEFAULT_AUTH_REDIRECT;
  }

  if (isAuthRoute(parsed.pathname)) {
    return DEFAULT_AUTH_REDIRECT;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
