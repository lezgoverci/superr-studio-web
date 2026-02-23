import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Handle, Position } from "@xyflow/react";
import type { ComponentProps } from "react";
import { AnimatedBorder } from "@/components/ui/animated-border";

export type NodeProps = ComponentProps<typeof Card> & {
  handles: {
    target: boolean;
    source: boolean;
  };
  status?: "idle" | "running" | "success" | "error";
};

export const Node = ({ handles, className, status, ...props }: NodeProps) => (
  <Card
    className={cn(
      "node-container relative size-full h-auto w-sm gap-0 rounded-2xl border border-[color:var(--workflow-node-border)] bg-[var(--workflow-node-bg)] p-0 text-[color:var(--workflow-node-text)] shadow-[var(--workflow-node-shadow)] backdrop-blur-xl transition-all duration-200",
      status === "success" && "border-green-500 border-2",
      status === "error" && "border-red-500 border-2",
      className
    )}
    {...props}
  >
    {status === "running" && <AnimatedBorder />}
    {handles.target && <Handle position={Position.Left} type="target" />}
    {handles.source && <Handle position={Position.Right} type="source" />}
    {props.children}
  </Card>
);

export type NodeHeaderProps = ComponentProps<typeof CardHeader>;

export const NodeHeader = ({ className, ...props }: NodeHeaderProps) => (
  <CardHeader
    className={cn(
      "gap-0.5 rounded-t-2xl border-b border-[color:var(--workflow-node-border)] bg-[image:var(--workflow-node-header-bg)] p-3!",
      className
    )}
    {...props}
  />
);

export type NodeTitleProps = ComponentProps<typeof CardTitle>;

export const NodeTitle = ({ className, ...props }: NodeTitleProps) => (
  <CardTitle className={cn("text-[color:var(--workflow-node-text)]", className)} {...props} />
);

export type NodeDescriptionProps = ComponentProps<typeof CardDescription>;

export const NodeDescription = ({ className, ...props }: NodeDescriptionProps) => (
  <CardDescription
    className={cn("text-[color:var(--workflow-node-muted)]", className)}
    {...props}
  />
);

export type NodeActionProps = ComponentProps<typeof CardAction>;

export const NodeAction = (props: NodeActionProps) => <CardAction {...props} />;

export type NodeContentProps = ComponentProps<typeof CardContent>;

export const NodeContent = ({ className, ...props }: NodeContentProps) => (
  <CardContent
    className={cn("rounded-b-2xl bg-transparent p-3", className)}
    {...props}
  />
);

export type NodeFooterProps = ComponentProps<typeof CardFooter>;

export const NodeFooter = ({ className, ...props }: NodeFooterProps) => (
  <CardFooter
    className={cn(
      "rounded-b-2xl border-t border-[color:var(--workflow-node-border)] bg-[var(--workflow-node-bg)] p-3!",
      className
    )}
    {...props}
  />
);
