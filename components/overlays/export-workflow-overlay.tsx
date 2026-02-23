"use client";

import { FileDown, FlaskConical } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Overlay } from "./overlay";
import { useOverlay } from "./overlay-provider";
import type { OverlayComponentProps } from "./types";

type ExportWorkflowOverlayProps = OverlayComponentProps<{
  onExportCode: () => void;
  onExportJson: () => void;
  isExportingCode?: boolean;
}>;

export function ExportWorkflowOverlay({
  overlayId,
  onExportCode,
  onExportJson,
  isExportingCode,
}: ExportWorkflowOverlayProps) {
  const { closeAll } = useOverlay();

  const handleExportCode = () => {
    closeAll();
    onExportCode();
  };

  const handleExportJson = () => {
    closeAll();
    onExportJson();
  };

  return (
    <Overlay
      actions={[
        { label: "Cancel", variant: "outline", onClick: closeAll },
        {
          label: "Export JSON",
          onClick: handleExportJson,
          variant: "secondary",
          disabled: isExportingCode,
        },
        {
          label: isExportingCode ? "Exporting..." : "Export Code (ZIP)",
          onClick: handleExportCode,
          loading: isExportingCode,
        },
      ]}
      overlayId={overlayId}
      title="Export Workflow"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <FileDown className="size-5" />
        <p className="text-sm">Choose an export format for this workflow.</p>
      </div>

      <p className="mt-4 text-muted-foreground text-sm">
        Code export generates a standalone Next.js project (ZIP). JSON export
        saves the workflow definition for portability and re-import.
      </p>

      <Alert className="mt-4">
        <FlaskConical className="size-4" />
        <AlertTitle>Experimental Feature</AlertTitle>
        <AlertDescription className="block">
          This feature is experimental and may have limitations. If you
          encounter any issues, please{" "}
          <a
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
            href="https://github.com/vercel-labs/workflow-builder-template/issues"
            rel="noopener noreferrer"
            target="_blank"
          >
            report them on GitHub
          </a>
          .
        </AlertDescription>
      </Alert>
    </Overlay>
  );
}
