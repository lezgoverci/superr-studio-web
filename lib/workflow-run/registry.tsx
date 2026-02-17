"use client";

import { defineRegistry, useBoundProp } from "@json-render/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button as UIButton } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox as UICheckbox } from "@/components/ui/checkbox";
import { Input as UIInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Select as UISelect,
} from "@/components/ui/select";
import { workflowRunCatalog } from "./catalog";

export const { registry: workflowRunRegistry } = defineRegistry(
  workflowRunCatalog,
  {
    components: {
      Stack: ({ props, children }) => {
        const gapClass =
          { sm: "gap-2", md: "gap-4", lg: "gap-6" }[props.gap ?? "md"] ??
          "gap-4";

        return (
          <div
            className={`flex ${props.direction === "horizontal" ? "flex-row" : "flex-col"} ${gapClass}`}
          >
            {children}
          </div>
        );
      },

      Card: ({ props, children }) => (
        <Card>
          {(props.title || props.description) && (
            <CardHeader>
              {props.title ? <CardTitle>{props.title}</CardTitle> : null}
              {props.description ? (
                <CardDescription>{props.description}</CardDescription>
              ) : null}
            </CardHeader>
          )}
          <CardContent className="flex flex-col gap-4">{children}</CardContent>
        </Card>
      ),

      Heading: ({ props }) => {
        const Tag = (props.level ?? "h2") as "h1" | "h2" | "h3" | "h4";
        const className =
          {
            h1: "text-3xl font-bold tracking-tight",
            h2: "text-2xl font-semibold tracking-tight",
            h3: "text-xl font-semibold",
            h4: "text-lg font-medium",
          }[props.level ?? "h2"] ?? "text-2xl font-semibold tracking-tight";

        return <Tag className={className}>{props.text}</Tag>;
      },

      Text: ({ props }) => (
        <p className={props.muted ? "text-muted-foreground" : ""}>
          {props.content}
        </p>
      ),

      Alert: ({ props }) => (
        <Alert variant={props.variant ?? "default"}>
          <AlertTitle>{props.title}</AlertTitle>
          {props.description ? (
            <AlertDescription>{props.description}</AlertDescription>
          ) : null}
        </Alert>
      ),

      Form: ({ children, emit }) => (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            emit("submit");
          }}
        >
          {children}
        </form>
      ),

      Input: ({ props, bindings }) => {
        const [value, setValue] = useBoundProp<string | number | undefined>(
          props.value as string | number | undefined,
          bindings?.value
        );

        return (
          <div className="flex flex-col gap-2">
            {props.label ? <Label>{props.label}</Label> : null}
            <UIInput
              onChange={(event) => {
                const nextValue =
                  props.type === "number"
                    ? Number(event.target.value)
                    : event.target.value;
                setValue(nextValue);
              }}
              placeholder={props.placeholder ?? ""}
              type={props.type ?? "text"}
              value={value == null ? "" : String(value)}
            />
          </div>
        );
      },

      Select: ({ props, bindings }) => {
        const [value, setValue] = useBoundProp<string | undefined>(
          props.value as string | undefined,
          bindings?.value
        );

        return (
          <div className="flex flex-col gap-2">
            {props.label ? <Label>{props.label}</Label> : null}
            <UISelect
              onValueChange={(nextValue) => setValue(nextValue)}
              value={value ?? ""}
            >
              <SelectTrigger>
                <SelectValue placeholder={props.placeholder ?? "Select..."} />
              </SelectTrigger>
              <SelectContent>
                {props.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </UISelect>
          </div>
        );
      },

      Checkbox: ({ props, bindings }) => {
        const [checked, setChecked] = useBoundProp<boolean | undefined>(
          props.checked as boolean | undefined,
          bindings?.checked
        );

        const checkboxId =
          bindings?.checked ?? `checkbox-${props.label ?? "field"}`;

        return (
          <div className="flex items-center gap-2">
            <UICheckbox
              checked={checked ?? false}
              id={checkboxId}
              onCheckedChange={(value) => setChecked(value === true)}
            />
            {props.label ? (
              <Label htmlFor={checkboxId}>{props.label}</Label>
            ) : null}
          </div>
        );
      },

      Button: ({ props, emit, loading }) => (
        <UIButton
          disabled={loading || (props.disabled ?? false)}
          onClick={() => emit("press")}
          variant={props.variant ?? "default"}
        >
          {props.label}
        </UIButton>
      ),
    },
  }
);
