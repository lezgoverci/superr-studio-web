"use client";

import {
  Download,
  ExternalLink,
  Loader2,
  Package,
  Search,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  api,
  type MarketplaceSearchResult,
  type UserSkillRecord,
} from "@/lib/api-client";
import { getOpenCodeSessionConnectionKey } from "@/lib/opencode-session-mapping";

const SKILLS_UPDATED_EVENT = "superr:skills-updated";

type SkillMutationContext = {
  agentCwd?: string;
  connectionKey?: string;
};

function formatInstalls(count: number): string {
  if (!count || count <= 0) return "";
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

function StatusBadge({ status }: { status: string }) {
  const colorClass =
    status === "installed"
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : status === "installing"
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${colorClass}`}
    >
      {status}
    </span>
  );
}

function InstalledSkillsList({
  skills,
  loading,
  onUninstall,
}: {
  skills: UserSkillRecord[];
  loading: boolean;
  onUninstall: (id: string, name: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
        <Package className="size-8 opacity-50" />
        <p className="text-sm">No skills installed yet.</p>
        <p className="text-xs">
          Search the marketplace below to find and install skills.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {skills.map((skill) => (
        <div
          className="flex items-center justify-between rounded-lg border p-3"
          key={skill.id}
        >
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{skill.skillName}</span>
              <StatusBadge status={skill.status} />
            </div>
            {skill.description && (
              <p className="line-clamp-1 text-muted-foreground text-xs">
                {skill.description}
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              Source: {skill.source}
            </p>
          </div>
          <Button
            onClick={() => onUninstall(skill.id, skill.skillName)}
            size="icon"
            variant="ghost"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function MarketplaceSearch({
  installedSkillNames,
  onInstalled,
  resolveInstallContext,
}: {
  installedSkillNames: Set<string>;
  onInstalled: (context: SkillMutationContext) => Promise<void> | void;
  resolveInstallContext: () => Promise<SkillMutationContext>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MarketplaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const data = await api.skills.search(q);
      setResults(data.skills);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        doSearch(value);
      }, 300);
    },
    [doSearch]
  );

  const handleInstall = async (skill: MarketplaceSearchResult) => {
    setInstalling(skill.slug);
    try {
      const mutationContext = await resolveInstallContext();
      await api.skills.install({
        source: skill.source || skill.slug,
        skillName: skill.name,
        ...(mutationContext.agentCwd
          ? { agentCwd: mutationContext.agentCwd }
          : {}),
      });
      toast.success(`Installed "${skill.name}" successfully`);
      await onInstalled(mutationContext);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Installation failed";
      toast.error(message);
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search skills marketplace..."
          value={query}
        />
      </div>

      {searching && (
        <div className="flex items-center justify-center py-4">
          <Spinner />
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="space-y-1">
          {results.map((skill) => {
            const isInstalled = installedSkillNames.has(
              skill.name.toLowerCase()
            );
            const isInstalling = installing === skill.slug;

            return (
              <div
                className="flex items-center justify-between rounded-lg border p-3"
                key={skill.slug}
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{skill.name}</span>
                    {skill.installs > 0 && (
                      <span className="flex items-center gap-0.5 text-muted-foreground text-xs">
                        <TrendingUp className="size-3" />
                        {formatInstalls(skill.installs)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <span>{skill.source}</span>
                    <a
                      className="inline-flex items-center gap-0.5 hover:text-foreground"
                      href={`https://skills.sh/${skill.slug}`}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>
                <Button
                  disabled={isInstalled || isInstalling}
                  onClick={() => handleInstall(skill)}
                  size="sm"
                  variant={isInstalled ? "secondary" : "default"}
                >
                  {isInstalling ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : (
                    <Download className="mr-1 size-3" />
                  )}
                  {isInstalled ? "Installed" : "Install"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {!searching && query.length >= 2 && results.length === 0 && (
        <p className="py-4 text-center text-muted-foreground text-sm">
          No skills found for &quot;{query}&quot;
        </p>
      )}

      {!searching && query.length > 0 && query.length < 2 && (
        <p className="py-4 text-center text-muted-foreground text-sm">
          Type at least 2 characters to search
        </p>
      )}
    </div>
  );
}

function ManualInstallFormWithContext({
  onInstalled,
  resolveInstallContext,
}: {
  onInstalled: (context: SkillMutationContext) => Promise<void> | void;
  resolveInstallContext: () => Promise<SkillMutationContext>;
}) {
  const [source, setSource] = useState("");
  const [skillName, setSkillName] = useState("");
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    if (!source.trim()) {
      toast.error("Please enter a skill source");
      return;
    }

    setInstalling(true);
    try {
      const mutationContext = await resolveInstallContext();
      await api.skills.install({
        source: source.trim(),
        skillName: skillName.trim() || undefined,
        ...(mutationContext.agentCwd
          ? { agentCwd: mutationContext.agentCwd }
          : {}),
      });
      toast.success("Skill installed successfully");
      setSource("");
      setSkillName("");
      await onInstalled(mutationContext);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Installation failed";
      toast.error(message);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Input
          onChange={(e) => setSource(e.target.value)}
          placeholder="owner/repo (e.g. vercel-labs/agent-skills)"
          value={source}
        />
        <Input
          onChange={(e) => setSkillName(e.target.value)}
          placeholder="Skill name (optional — leave empty if repo has one skill)"
          value={skillName}
        />
      </div>
      <Button disabled={installing || !source.trim()} onClick={handleInstall}>
        {installing ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Download className="mr-2 size-4" />
        )}
        Install Skill
      </Button>
    </div>
  );
}

export function SkillsSection() {
  const [skills, setSkills] = useState<UserSkillRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSkills = useCallback(async () => {
    try {
      const data = await api.skills.list();
      setSkills(data);
    } catch (error) {
      console.error("Failed to load skills:", error);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadSkills().finally(() => setLoading(false));
  }, [loadSkills]);

  const emitSkillsUpdated = useCallback(
    async (context: SkillMutationContext) => {
      const connectionKey = context.connectionKey;
      let refreshFailed = false;

      if (connectionKey) {
        try {
          await api.opencode.disposeInstance({
            ...(context.agentCwd ? { directory: context.agentCwd } : {}),
          });
        } catch (error) {
          refreshFailed = true;
          console.error("Failed to dispose OpenCode instance:", error);
        }
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(SKILLS_UPDATED_EVENT, {
            detail: {
              changedAt: Date.now(),
              ...(connectionKey ? { connectionKey } : {}),
            },
          })
        );
      }

      if (refreshFailed) {
        toast.error(
          "Skill updated, but failed to refresh the agent runtime. Reload the session manually."
        );
      }
    },
    []
  );

  const resolveSkillMutationContext = useCallback(async () => {
    try {
      const response = await api.opencode.getConnection();
      if (
        !(
          response.configured &&
          Array.isArray(response.connections) &&
          response.connections.length > 0
        )
      ) {
        return {};
      }

      const activeConnection =
        response.connections.find(
          (connection) => connection.id === response.activeConnectionId
        ) ?? response.connections[0];

      if (!activeConnection) {
        return {};
      }

      const connectionKey = getOpenCodeSessionConnectionKey({
        url: activeConnection.url,
        username: activeConnection.username,
        ...(activeConnection.directory
          ? { directory: activeConnection.directory }
          : {}),
      });

      if (activeConnection.directory?.trim()) {
        return {
          agentCwd: activeConnection.directory.trim(),
          connectionKey,
        };
      }

      try {
        const pathInfo = await api.opencode.getPath();
        const discoveredDirectory = pathInfo.directory?.trim();
        if (discoveredDirectory) {
          return {
            agentCwd: discoveredDirectory,
            connectionKey,
          };
        }
      } catch {
        // Ignore lookup failures; skill install/uninstall can still proceed.
      }

      return { connectionKey };
    } catch {
      return {};
    }
  }, []);

  const handleUninstall = async (id: string, name: string) => {
    try {
      const mutationContext = await resolveSkillMutationContext();
      await api.skills.uninstall(
        id,
        mutationContext.agentCwd
          ? { agentCwd: mutationContext.agentCwd }
          : undefined
      );
      await emitSkillsUpdated(mutationContext);
      toast.success(`Uninstalled "${name}"`);
      await loadSkills();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to uninstall";
      toast.error(message);
    }
  };

  const handleInstalled = useCallback(
    async (mutationContext: SkillMutationContext) => {
      await emitSkillsUpdated(mutationContext);
      await loadSkills();
    },
    [emitSkillsUpdated, loadSkills]
  );

  const installedSkillNames = new Set(
    skills.map((s) => s.skillName.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Installed Skills</CardTitle>
        </CardHeader>
        <CardContent>
          <InstalledSkillsList
            loading={loading}
            onUninstall={handleUninstall}
            skills={skills}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills Marketplace</CardTitle>
        </CardHeader>
        <CardContent>
          <MarketplaceSearch
            installedSkillNames={installedSkillNames}
            onInstalled={handleInstalled}
            resolveInstallContext={resolveSkillMutationContext}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Install from Source</CardTitle>
        </CardHeader>
        <CardContent>
          <ManualInstallFormWithContext
            onInstalled={handleInstalled}
            resolveInstallContext={resolveSkillMutationContext}
          />
        </CardContent>
      </Card>
    </div>
  );
}
