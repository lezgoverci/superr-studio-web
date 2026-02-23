"use client";

import { usePathname } from "next/navigation";
import { WorkflowCanvas } from "./workflow-canvas";

const APP_WORKFLOW_EDITOR_PATTERN = /^\/app\/workflows\/[^/]+$/;

export function PersistentCanvas() {
  const pathname = usePathname();

  // Canvas is only used by builder pages inside the app shell.
  const showCanvas =
    pathname === "/app/workflows/new" ||
    APP_WORKFLOW_EDITOR_PATTERN.test(pathname);

  if (!showCanvas) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-0">
      <WorkflowCanvas />
    </div>
  );
}
