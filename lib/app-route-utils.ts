const WORKFLOW_EDITOR_ROUTE_REGEX = /^\/app\/workflows\/[^/]+$/;

export function isAssistantRoute(pathname: string): boolean {
  return pathname === "/app/assistant";
}

export function isWorkflowEditorRoute(pathname: string): boolean {
  return (
    pathname === "/app/workflows/new" ||
    WORKFLOW_EDITOR_ROUTE_REGEX.test(pathname)
  );
}

export function isWorkflowChatEligibleRoute(pathname: string): boolean {
  return isWorkflowEditorRoute(pathname);
}

export function resolveShellArea(pathname: string): "workspace" | "builder" {
  if (
    pathname === "/app/studio" ||
    isAssistantRoute(pathname) ||
    pathname.startsWith("/app/workflows") ||
    pathname.startsWith("/app/sandboxes") ||
    pathname.startsWith("/app/library")
  ) {
    return "builder";
  }

  return "workspace";
}

export function getAssistantReturnPath(
  pathname: string | null | undefined
): string {
  if (pathname && isWorkflowChatEligibleRoute(pathname)) {
    return pathname;
  }

  return "/app/workflows";
}
