"use client";

import { usePathname } from "next/navigation";
import { WorkflowCanvas } from "./workflow-canvas";

const WORKFLOW_RUN_PAGE_PATTERN = /^\/workflows\/[^/]+\/run$/;

export function PersistentCanvas() {
  const pathname = usePathname();

  // Show canvas on homepage and workflow editor pages.
  // The generated run page should render without the background canvas.
  const isWorkflowRunPage = WORKFLOW_RUN_PAGE_PATTERN.test(pathname);
  const showCanvas =
    pathname === "/" ||
    (pathname.startsWith("/workflows/") && !isWorkflowRunPage);

  if (!showCanvas) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-0">
      <WorkflowCanvas />
    </div>
  );
}
