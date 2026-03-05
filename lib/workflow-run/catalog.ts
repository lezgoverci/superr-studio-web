import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const workflowRunCatalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({
        direction: z.enum(["horizontal", "vertical"]).nullable(),
        gap: z.enum(["sm", "md", "lg"]).nullable(),
      }),
      slots: ["default"],
      description: "Flex layout container for grouping child elements.",
      example: { direction: "vertical", gap: "md" },
    },

    Card: {
      props: z.object({
        title: z.string().nullable(),
        description: z.string().nullable(),
      }),
      slots: ["default"],
      description: "Card container with optional title and description.",
      example: { title: "Run Workflow", description: "Enter your inputs" },
    },

    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(["h1", "h2", "h3", "h4"]).nullable(),
      }),
      description: "Section heading text.",
      example: { text: "Workflow Runner", level: "h2" },
    },

    Text: {
      props: z.object({
        content: z.string(),
        muted: z.boolean().nullable(),
      }),
      description: "Paragraph text content.",
      example: { content: "Provide input and submit to execute the workflow." },
    },

    Alert: {
      props: z.object({
        title: z.string(),
        description: z.string().nullable(),
        variant: z.enum(["default", "destructive"]).nullable(),
      }),
      description: "Status and error alert box.",
      example: {
        title: "Execution Failed",
        description: "Please check your inputs.",
        variant: "destructive",
      },
    },

    Form: {
      props: z.object({}),
      slots: ["default"],
      description:
        "Form container. Use on.submit action binding to submit workflow execution.",
      example: {},
    },

    Input: {
      props: z.object({
        label: z.string().nullable(),
        value: z
          .union([z.string(), z.number(), z.record(z.string(), z.unknown())])
          .nullable(),
        placeholder: z.string().nullable(),
        type: z.enum(["text", "email", "password", "number", "tel"]).nullable(),
      }),
      description:
        "Single-line input field. Use value with $bindState for two-way binding.",
      example: {
        label: "Customer ID",
        value: { $bindState: "/form/customerId" },
        placeholder: "cust_123",
        type: "text",
      },
    },

    Select: {
      props: z.object({
        label: z.string().nullable(),
        value: z.string().nullable(),
        placeholder: z.string().nullable(),
        options: z.array(
          z.object({
            value: z.string(),
            label: z.string(),
          })
        ),
      }),
      description:
        "Dropdown select field. Use value with $bindState for two-way binding.",
      example: {
        label: "Priority",
        value: { $bindState: "/form/priority" },
        options: [
          { value: "low", label: "Low" },
          { value: "high", label: "High" },
        ],
      },
    },

    Checkbox: {
      props: z.object({
        label: z.string().nullable(),
        checked: z.boolean().nullable(),
      }),
      description:
        "Checkbox field. Use checked with $bindState for two-way binding.",
      example: {
        label: "Send notification",
        checked: { $bindState: "/form/sendNotification" },
      },
    },

    Button: {
      props: z.object({
        label: z.string(),
        variant: z
          .enum(["default", "secondary", "destructive", "outline", "ghost"])
          .nullable(),
        disabled: z.boolean().nullable(),
      }),
      description:
        "Clickable button. Use on.press or Form on.submit to trigger actions.",
      example: { label: "Run Workflow", variant: "default", disabled: null },
    },
  },
  actions: {
    submitWorkflow: {
      params: z
        .object({
          input: z.record(z.string(), z.unknown()).optional(),
        })
        .partial(),
      description:
        "Execute the workflow with provided input. Use params.input to pass structured payload.",
    },
  },
});
