"use client";

import { useReactFlow } from "@xyflow/react";
import { ZoomIn, ZoomOut, Maximize2, MapPin, MapPinXInside } from "lucide-react";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { showMinimapAtom } from "@/lib/workflow-store";

export const Controls = () => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [showMinimap, setShowMinimap] = useAtom(showMinimapAtom);
  const controlButtonStyle = {
    borderColor: "var(--workflow-panel-border, var(--border))",
    color: "var(--workflow-node-muted, var(--muted-foreground))",
  };
  const controlButtonClassName =
    "border bg-transparent shadow-none transition-colors hover:bg-[var(--workflow-control-hover-bg)] hover:text-[color:var(--workflow-node-text)] disabled:opacity-100 disabled:[&>svg]:text-muted-foreground";

  const handleZoomIn = () => {
    zoomIn();
  };

  const handleZoomOut = () => {
    zoomOut();
  };

  const handleFitView = () => {
    fitView({ padding: 0.2, duration: 300 });
  };

  const handleToggleMinimap = () => {
    setShowMinimap(!showMinimap);
  };

  return (
    <ButtonGroup orientation="vertical">
      <Button
        className={controlButtonClassName}
        onClick={handleZoomIn}
        size="icon"
        style={controlButtonStyle}
        title="Zoom in"
        variant="secondary"
      >
        <ZoomIn className="size-4" />
      </Button>
      <Button
        className={controlButtonClassName}
        onClick={handleZoomOut}
        size="icon"
        style={controlButtonStyle}
        title="Zoom out"
        variant="secondary"
      >
        <ZoomOut className="size-4" />
      </Button>
      <Button
        className={controlButtonClassName}
        onClick={handleFitView}
        size="icon"
        style={controlButtonStyle}
        title="Fit view"
        variant="secondary"
      >
        <Maximize2 className="size-4" />
      </Button>
      <Button
        className={controlButtonClassName}
        onClick={handleToggleMinimap}
        size="icon"
        style={controlButtonStyle}
        title={showMinimap ? "Hide minimap" : "Show minimap"}
        variant="secondary"
      >
        {showMinimap ? (
          <MapPin className="size-4" />
        ) : (
          <MapPinXInside className="size-4" />
        )}
      </Button>
    </ButtonGroup>
  );
};
