import { cn } from "@/lib/utils";
import { Panel as PanelPrimitive } from "@xyflow/react";
import type { ComponentProps } from "react";

type PanelProps = ComponentProps<typeof PanelPrimitive>;

export const Panel = ({ className, style, ...props }: PanelProps) => (
  <PanelPrimitive
    className={cn(
      "m-4 rounded-xl border p-1.5 backdrop-blur-sm",
      className
    )}
    style={{
      background: "var(--workflow-panel-bg, var(--card))",
      borderColor: "var(--workflow-panel-border, var(--border))",
      boxShadow:
        "var(--workflow-panel-shadow, 0 1px 2px 0 rgb(0 0 0 / 0.08))",
      ...style,
    }}
    {...props}
  />
);
