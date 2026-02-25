"use client";

import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { IntegrationIcon } from "@/components/ui/integration-icon";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type Integration } from "@/lib/api-client";
import { getIntegrationLabels } from "@/plugins";

const SYSTEM_INTEGRATION_LABELS: Record<string, string> = {
  database: "Database",
};

function AddConnectionButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <Plus className="mr-2 size-4" />
      Add Connection
    </Button>
  );
}

function ConnectionItem({
  integration,
  onEdit,
  onDelete,
  onTest,
  testingId,
}: {
  integration: Integration & { label: string };
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  testingId: string | null;
}) {
  const isTesting = testingId === integration.id;

  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div className="flex min-w-0 items-center gap-3">
        <IntegrationIcon
          className="size-5 shrink-0"
          integration={
            integration.type === "ai-gateway" ? "vercel" : integration.type
          }
        />
        <div className="min-w-0">
          <p className="font-medium text-sm">{integration.label}</p>
          <p className="truncate text-muted-foreground text-xs">
            {integration.name}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          className="h-8 px-2"
          disabled={isTesting}
          onClick={onTest}
          size="sm"
          variant="outline"
        >
          {isTesting ? (
            <Spinner className="size-3" />
          ) : (
            <span className="text-xs">Test</span>
          )}
        </Button>
        <Button
          className="size-8"
          onClick={onEdit}
          size="icon"
          variant="outline"
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          className="size-8"
          onClick={onDelete}
          size="icon"
          variant="outline"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

export function ConnectionsSection({
  onOpenAddConnection,
  onOpenEditConnection,
  onOpenDeleteConnection,
}: {
  onOpenAddConnection: () => void;
  onOpenEditConnection: (integration: Integration) => void;
  onOpenDeleteConnection: (integration: Integration) => void;
}) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const loadIntegrations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.integration.getAll();
      setIntegrations(data);
    } catch (error) {
      console.error("Failed to load integrations:", error);
      toast.error("Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const integrationsWithLabels = useMemo(() => {
    const labels = getIntegrationLabels() as Record<string, string>;
    const filterLower = filter.toLowerCase();

    return integrations
      .map((integration) => ({
        ...integration,
        label:
          labels[integration.type] ||
          SYSTEM_INTEGRATION_LABELS[integration.type] ||
          integration.type,
      }))
      .filter((integration) => {
        if (!filter) {
          return true;
        }
        return (
          integration.label.toLowerCase().includes(filterLower) ||
          integration.name.toLowerCase().includes(filterLower) ||
          integration.type.toLowerCase().includes(filterLower)
        );
      })
      .sort((a, b) => {
        const labelCompare = a.label.localeCompare(b.label);
        if (labelCompare !== 0) {
          return labelCompare;
        }
        return a.name.localeCompare(b.name);
      });
  }, [integrations, filter]);

  const handleTest = async (id: string) => {
    try {
      setTestingId(id);
      const result = await api.integration.testConnection(id);

      if (result.status === "success") {
        toast.success(result.message || "Connection successful");
      } else {
        toast.error(result.message || "Connection test failed");
      }
    } catch (error) {
      console.error("Connection test failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Connection test failed",
      );
    } finally {
      setTestingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Connections</CardTitle>
        <AddConnectionButton onClick={onOpenAddConnection} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter connections..."
            value={filter}
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        )}

        {!loading && integrationsWithLabels.length === 0 && (
          <div className="py-8 text-center text-muted-foreground text-sm">
            {filter
              ? "No connections match your filter"
              : "No connections configured yet"}
          </div>
        )}

        {!loading && integrationsWithLabels.length > 0 && (
          <div className="space-y-2">
            {integrationsWithLabels.map((integration) => (
              <ConnectionItem
                key={integration.id}
                integration={integration}
                onEdit={() => onOpenEditConnection(integration)}
                onDelete={() => onOpenDeleteConnection(integration)}
                onTest={() => handleTest(integration.id)}
                testingId={testingId}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
