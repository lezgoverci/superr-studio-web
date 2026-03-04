"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";

const PRESET_DELAYS = [
  { label: "Off (instant)", value: "0" },
  { label: "200ms", value: "200" },
  { label: "500ms", value: "500" },
  { label: "1 second", value: "1000" },
  { label: "2 seconds", value: "2000" },
  { label: "Custom", value: "custom" },
] as const;

export function WorkflowSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [delayMs, setDelayMs] = useState(0);
  const [customValue, setCustomValue] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("0");

  const loadPreferences = useCallback(async () => {
    try {
      const data = await api.userPreferences.get();
      const val = data.workflowOperationDelayMs;
      setDelayMs(val);

      const matchingPreset = PRESET_DELAYS.find(
        (p) => p.value !== "custom" && Number(p.value) === val
      );
      if (matchingPreset) {
        setSelectedPreset(matchingPreset.value);
      } else {
        setSelectedPreset("custom");
        setCustomValue(String(val));
      }
    } catch (error) {
      console.error("Failed to load preferences:", error);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadPreferences().finally(() => setLoading(false));
  }, [loadPreferences]);

  const handlePresetChange = (value: string) => {
    setSelectedPreset(value);
    if (value !== "custom") {
      const numVal = Number(value);
      setDelayMs(numVal);
      setCustomValue("");
    } else {
      setCustomValue(String(delayMs));
    }
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setCustomValue(raw);
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 5000) {
      setDelayMs(parsed);
    }
  };

  const savePreferences = async () => {
    try {
      setSaving(true);
      await api.userPreferences.update({ workflowOperationDelayMs: delayMs });
      toast.success("Settings saved");
    } catch (error) {
      console.error("Failed to save preferences:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow Stream</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Operation Animation Delay</Label>
              <p className="text-muted-foreground text-xs">
                When an AI agent builds or edits a workflow, each operation
                (add node, add edge, etc.) is streamed to the canvas. Set a
                delay to watch operations applied one at a time instead of all
                at once. Set to 0 for instant updates.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Select
                onValueChange={handlePresetChange}
                value={selectedPreset}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_DELAYS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedPreset === "custom" && (
                <div className="flex items-center gap-2">
                  <Input
                    className="w-[100px]"
                    max={5000}
                    min={0}
                    onChange={handleCustomChange}
                    placeholder="0"
                    step={100}
                    type="number"
                    value={customValue}
                  />
                  <span className="text-muted-foreground text-sm">ms</span>
                </div>
              )}
            </div>

            <Button disabled={saving} onClick={savePreferences}>
              {saving ? <Spinner className="mr-2 size-4" /> : null}
              Save Changes
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
