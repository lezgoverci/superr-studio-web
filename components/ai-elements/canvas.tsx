import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type ReactFlowProps,
} from "@xyflow/react";
import type { ReactNode } from "react";
import "@xyflow/react/dist/style.css";

type CanvasProps = ReactFlowProps & {
  children?: ReactNode;
};

export const Canvas = ({ children, ...props }: CanvasProps) => {
  return (
    <ReactFlow
      deleteKeyCode={["Backspace", "Delete"]}
      fitView
      panActivationKeyCode={null}
      selectionOnDrag={false}
      zoomOnDoubleClick={false}
      zoomOnPinch
      {...props}
    >
      <Background
        bgColor="var(--workflow-grid-bg, var(--sidebar))"
        color="var(--workflow-grid-color, var(--border))"
        gap={20}
        size={1}
        variant={BackgroundVariant.Dots}
      />
      {children}
    </ReactFlow>
  );
};
