"use client";

import { Suspense } from "react";
import { AIAgentWindowManager } from "@/components/ai-agent/ai-agent-window-manager";
import { OverlayContainer } from "@/components/overlays/overlay-container";
import { OverlaySync } from "@/components/overlays/overlay-sync";

/**
 * Global modals and overlays that need to be rendered once at app level
 */
export function GlobalModals() {
  return (
    <>
      <Suspense fallback={null}>
        <AIAgentWindowManager />
      </Suspense>
      <OverlayContainer />
      <OverlaySync />
    </>
  );
}
