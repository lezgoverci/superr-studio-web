import type { Spec } from "@json-render/core";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { WorkflowRunner } from "@/components/workflow-run/workflow-runner";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";

type WorkflowRunPageProps = {
  params: Promise<{ workflowId: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type ActionBinding = {
  action: string;
  params?: Record<string, unknown>;
};

function isActionBinding(value: unknown): value is ActionBinding {
  return isRecord(value) && typeof value.action === "string";
}

function includesSubmitWorkflow(value: unknown): boolean {
  if (isActionBinding(value)) {
    return value.action === "submitWorkflow";
  }

  if (!Array.isArray(value)) {
    return false;
  }

  return value.some(
    (entry) => isActionBinding(entry) && entry.action === "submitWorkflow"
  );
}

function hasSubmitWorkflowBinding(elements: Record<string, unknown>): boolean {
  for (const elementValue of Object.values(elements)) {
    if (!(isRecord(elementValue) && isRecord(elementValue.on))) {
      continue;
    }

    if (
      Object.values(elementValue.on).some((binding) =>
        includesSubmitWorkflow(binding)
      )
    ) {
      return true;
    }
  }

  return false;
}

function addSubmitBinding(
  spec: Record<string, unknown>,
  elementKey: string,
  eventName: "submit" | "press"
): Record<string, unknown> {
  const elements = spec.elements;
  if (!isRecord(elements)) {
    return spec;
  }

  const element = elements[elementKey];
  if (!isRecord(element)) {
    return spec;
  }

  const existingOn = isRecord(element.on) ? element.on : {};
  const existingEventBinding = existingOn[eventName];

  if (includesSubmitWorkflow(existingEventBinding)) {
    return spec;
  }

  const submitBinding: ActionBinding = {
    action: "submitWorkflow",
    params: {
      input: { $state: "/form" },
    },
  };

  let nextEventBinding: unknown = submitBinding;
  if (Array.isArray(existingEventBinding)) {
    nextEventBinding = [...existingEventBinding, submitBinding];
  } else if (existingEventBinding) {
    nextEventBinding = [existingEventBinding, submitBinding];
  }

  return {
    ...spec,
    elements: {
      ...elements,
      [elementKey]: {
        ...element,
        on: {
          ...existingOn,
          [eventName]: nextEventBinding,
        },
      },
    },
  };
}

function ensureSubmitBinding(
  spec: Record<string, unknown>
): Record<string, unknown> {
  const elements = spec.elements;
  if (!isRecord(elements)) {
    return spec;
  }

  if (hasSubmitWorkflowBinding(elements)) {
    return spec;
  }

  const elementEntries = Object.entries(elements).flatMap(
    ([key, elementValue]) =>
      isRecord(elementValue) ? [[key, elementValue] as const] : []
  );
  const formEntry = elementEntries.find(
    ([, elementValue]) => elementValue.type === "Form"
  );
  if (formEntry) {
    return addSubmitBinding(spec, formEntry[0], "submit");
  }

  const buttonEntry =
    elementEntries.find(([, elementValue]) => {
      if (elementValue.type !== "Button" || !isRecord(elementValue.props)) {
        return false;
      }
      const label =
        typeof elementValue.props.label === "string"
          ? elementValue.props.label.toLowerCase()
          : "";
      return (
        label.includes("run") ||
        label.includes("submit") ||
        label.includes("start")
      );
    }) ||
    elementEntries.find(([, elementValue]) => elementValue.type === "Button");

  if (buttonEntry) {
    return addSubmitBinding(spec, buttonEntry[0], "press");
  }

  return spec;
}

function parseSpec(value: unknown): Spec | null {
  if (!isRecord(value)) {
    return null;
  }

  const root = value.root;
  const elements = value.elements;

  if (typeof root !== "string" || !isRecord(elements)) {
    return null;
  }

  return ensureSubmitBinding(value) as unknown as Spec;
}

export default async function WorkflowRunPage({
  params,
}: WorkflowRunPageProps) {
  const { workflowId } = await params;

  const headerStore = await headers();
  const session = await auth.api.getSession({
    headers: headerStore,
  });

  const workflow = await db.query.workflows.findFirst({
    where: eq(workflows.id, workflowId),
  });

  if (!workflow) {
    notFound();
  }

  const isOwner = session?.user?.id === workflow.userId;
  const canView = isOwner || workflow.visibility === "public";

  if (!canView) {
    notFound();
  }

  const spec = parseSpec(workflow.uiSpec);

  return (
    <main className="pointer-events-auto min-h-dvh w-full bg-muted/20 px-4 py-10">
      <div className="mx-auto mb-6 w-full max-w-3xl">
        <h1 className="font-semibold text-2xl tracking-tight">
          {workflow.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          Provide input and submit to execute this workflow.
        </p>
      </div>

      {spec ? (
        <WorkflowRunner
          isOwner={isOwner}
          spec={spec}
          workflowId={workflow.id}
        />
      ) : (
        <div className="mx-auto w-full max-w-3xl rounded-xl border bg-background p-6 text-muted-foreground text-sm shadow-sm">
          This workflow does not have a generated run form yet.
        </div>
      )}
    </main>
  );
}
