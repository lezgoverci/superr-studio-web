"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TemplateBadgeInput } from "@/components/ui/template-badge-input";
import { TemplateBadgeTextarea } from "@/components/ui/template-badge-textarea";
import {
  type ActionConfigField,
  type ActionConfigFieldBase,
  flattenConfigFields,
  isFieldGroup,
} from "@/plugins";
import { SchemaBuilder, type SchemaField } from "./schema-builder";

type FieldProps = {
  field: ActionConfigFieldBase;
  value: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
};

function TemplateInputField({ field, value, onChange, disabled }: FieldProps) {
  return (
    <TemplateBadgeInput
      disabled={disabled}
      id={field.key}
      onChange={onChange}
      placeholder={field.placeholder}
      value={value}
    />
  );
}

function TemplateTextareaField({
  field,
  value,
  onChange,
  disabled,
}: FieldProps) {
  return (
    <TemplateBadgeTextarea
      disabled={disabled}
      id={field.key}
      onChange={onChange}
      placeholder={field.placeholder}
      rows={field.rows || 4}
      value={value}
    />
  );
}

function TextInputField({ field, value, onChange, disabled }: FieldProps) {
  return (
    <Input
      disabled={disabled}
      id={field.key}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      value={value}
    />
  );
}

function NumberInputField({ field, value, onChange, disabled }: FieldProps) {
  return (
    <Input
      disabled={disabled}
      id={field.key}
      min={field.min}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      type="number"
      value={value}
    />
  );
}

function SelectField({ field, value, onChange, disabled }: FieldProps) {
  if (!field.options) {
    return null;
  }

  return (
    <Select disabled={disabled} onValueChange={onChange} value={value}>
      <SelectTrigger className="w-full" id={field.key}>
        <SelectValue placeholder={field.placeholder} />
      </SelectTrigger>
      <SelectContent>
        {field.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SchemaBuilderField(props: FieldProps) {
  return (
    <SchemaBuilder
      disabled={props.disabled}
      onChange={(schema) => props.onChange(JSON.stringify(schema))}
      schema={props.value ? (JSON.parse(props.value) as SchemaField[]) : []}
    />
  );
}

function SandboxPickerField({ value, onChange, disabled }: FieldProps) {
  const [sandboxes, setSandboxes] = useState<
    Array<{ id: string; name: string; status: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/sandboxes");
        if (!res.ok) throw new Error("Failed to fetch sandboxes");
        const data = await res.json();
        if (active) setSandboxes(data);
      } catch (err) {
        console.error("Failed to load sandboxes:", err);
        if (active) setSandboxes([]);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      running: "bg-green-500",
      stopped: "bg-gray-400",
      pending: "bg-yellow-500",
      failed: "bg-red-500",
    };
    return (
      <span
        className={`inline-block h-2 w-2 rounded-full ${colors[status] || "bg-gray-400"}`}
      />
    );
  };

  return (
    <Select
      disabled={disabled || isLoading}
      onValueChange={(v) => onChange(v === "__ephemeral" ? "" : v)}
      value={value || "__ephemeral"}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={isLoading ? "Loading..." : "Select sandbox"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__ephemeral">
          Ephemeral (create new each run)
        </SelectItem>
        {sandboxes.length > 0 && <SelectSeparator />}
        {sandboxes.map((sb) => (
          <SelectItem key={sb.id} value={sb.id}>
            <span className="flex items-center gap-2">
              {statusBadge(sb.status)}
              {sb.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const FIELD_RENDERERS: Record<
  ActionConfigFieldBase["type"],
  React.ComponentType<FieldProps>
> = {
  "template-input": TemplateInputField,
  "template-textarea": TemplateTextareaField,
  text: TextInputField,
  number: NumberInputField,
  select: SelectField,
  "schema-builder": SchemaBuilderField,
  "sandbox-picker": SandboxPickerField,
};

function resolveFieldValue(
  config: Record<string, unknown>,
  key: string,
  fieldDefaults: Record<string, string | undefined>
): unknown {
  const configValue = config[key];
  if (configValue !== undefined && configValue !== null) {
    return configValue;
  }
  return fieldDefaults[key];
}

function getFieldDefaults(
  fields: ActionConfigField[]
): Record<string, string | undefined> {
  const defaults: Record<string, string | undefined> = {};

  for (const field of flattenConfigFields(fields)) {
    defaults[field.key] = field.defaultValue;
  }

  return defaults;
}

/**
 * Renders a single base field
 */
type RenderFieldContext = {
  config: Record<string, unknown>;
  fieldDefaults: Record<string, string | undefined>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
};

function renderField(
  field: ActionConfigFieldBase,
  context: RenderFieldContext
) {
  const { config, fieldDefaults, onUpdateConfig, disabled } = context;

  // Check conditional rendering
  if (field.showWhen) {
    const dependentValue = resolveFieldValue(
      config,
      field.showWhen.field,
      fieldDefaults
    );
    if (dependentValue !== field.showWhen.equals) {
      return null;
    }
  }

  const value = String(
    resolveFieldValue(config, field.key, fieldDefaults) ?? ""
  );
  const FieldRenderer = FIELD_RENDERERS[field.type];

  return (
    <div className="space-y-2" key={field.key}>
      <Label className="ml-1" htmlFor={field.key}>
        {field.label}
        {field.required && <span className="text-red-500">*</span>}
      </Label>
      <FieldRenderer
        disabled={disabled}
        field={field}
        onChange={(val) => onUpdateConfig(field.key, val)}
        value={value}
      />
    </div>
  );
}

/**
 * Collapsible field group component
 */
function FieldGroup({
  label,
  fields,
  config,
  fieldDefaults,
  onUpdateConfig,
  disabled,
  defaultExpanded = false,
}: {
  label: string;
  fields: ActionConfigFieldBase[];
  config: Record<string, unknown>;
  fieldDefaults: Record<string, string | undefined>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="space-y-2">
      <button
        className="ml-1 flex items-center gap-1 text-left"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <span className="font-medium text-sm">{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
            isExpanded ? "" : "-rotate-90"
          }`}
        />
      </button>
      {isExpanded && (
        <div className="ml-1 space-y-4 border-primary/50 border-l-2 py-2 pl-3">
          {fields.map((field) => {
            const context = {
              config,
              fieldDefaults,
              onUpdateConfig,
              disabled,
            };
            return renderField(field, context);
          })}
        </div>
      )}
    </div>
  );
}

type ActionConfigRendererProps = {
  fields: ActionConfigField[];
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
};

/**
 * Renders action config fields declaratively
 * Converts ActionConfigField definitions into actual UI components
 */
export function ActionConfigRenderer({
  fields,
  config,
  onUpdateConfig,
  disabled,
}: ActionConfigRendererProps) {
  const fieldDefaults = getFieldDefaults(fields);
  const context = { config, fieldDefaults, onUpdateConfig, disabled };

  return (
    <>
      {fields.map((field) => {
        if (isFieldGroup(field)) {
          return (
            <FieldGroup
              config={config}
              defaultExpanded={field.defaultExpanded}
              disabled={disabled}
              fieldDefaults={fieldDefaults}
              fields={field.fields}
              key={`group-${field.label}`}
              label={field.label}
              onUpdateConfig={onUpdateConfig}
            />
          );
        }

        return renderField(field, context);
      })}
    </>
  );
}
