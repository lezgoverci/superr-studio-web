"use client";

import type { Spec } from "@json-render/core";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
} from "@json-render/react";
import { workflowRunRegistry } from "@/lib/workflow-run/registry";

type PublicArtifactSpecProps = {
  spec: Spec;
};

export function PublicArtifactSpec({ spec }: PublicArtifactSpecProps) {
  return (
    <StateProvider initialState={{}}>
      <VisibilityProvider>
        <ActionProvider handlers={{}}>
          <Renderer registry={workflowRunRegistry} spec={spec} />
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
  );
}
