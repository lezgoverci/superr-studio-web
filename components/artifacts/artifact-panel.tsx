"use client";

import { ExternalLink, Link2, Pin, PinOff, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { ArtifactWithPublicationRecord } from "@/lib/artifacts/types";

type ArtifactPanelProps = {
  workflowId?: string;
  executionId?: string;
  embedded?: boolean;
  initialNodeFilter?: string;
};

type DateFilter = "all" | "24h" | "7d" | "30d";
type PublicationVisibility = "unlisted" | "public";
type KindFilter =
  | "all"
  | "file"
  | "image"
  | "video"
  | "audio"
  | "web_page"
  | "url"
  | "json"
  | "text"
  | "unknown";

const DATE_FILTERS: Array<{ value: DateFilter; label: string }> = [
  { value: "all", label: "All dates" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

const KIND_OPTIONS: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "All types" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "web_page", label: "Web page" },
  { value: "url", label: "URL" },
  { value: "json", label: "JSON" },
  { value: "text", label: "Text" },
  { value: "file", label: "File" },
  { value: "unknown", label: "Unknown" },
];

const DATE_VALUES = new Set<DateFilter>(DATE_FILTERS.map((item) => item.value));
const KIND_VALUES = new Set<KindFilter>(KIND_OPTIONS.map((item) => item.value));
const INLINE_DOWNLOAD_SANITIZE_REGEX = /[^a-zA-Z0-9._-]+/g;

function parseDateFilter(value: string | null): DateFilter {
  if (value && DATE_VALUES.has(value as DateFilter)) {
    return value as DateFilter;
  }
  return "all";
}

function parseKindFilter(value: string | null): KindFilter {
  if (value && KIND_VALUES.has(value as KindFilter)) {
    return value as KindFilter;
  }
  return "all";
}

function isVisualKind(kind: string): boolean {
  return kind === "image" || kind === "video";
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function passesDateFilter(dateString: string, filter: DateFilter): boolean {
  if (filter === "all") {
    return true;
  }

  const createdAt = new Date(dateString).getTime();
  if (!Number.isFinite(createdAt)) {
    return false;
  }

  const now = Date.now();
  const ranges: Record<Exclude<DateFilter, "all">, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };

  return now - createdAt <= ranges[filter];
}

function relativeDate(dateString: string): string {
  const date = new Date(dateString).getTime();
  const delta = Date.now() - date;
  if (!Number.isFinite(delta)) {
    return dateString;
  }
  if (delta < 60_000) {
    return "just now";
  }
  if (delta < 3_600_000) {
    return `${Math.floor(delta / 60_000)}m ago`;
  }
  if (delta < 86_400_000) {
    return `${Math.floor(delta / 3_600_000)}h ago`;
  }
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

function artifactOpenUrl(
  artifact: ArtifactWithPublicationRecord
): string | null {
  if (artifact.publication?.slug) {
    return `/a/${artifact.publication.slug}`;
  }
  return artifact.blobUrl || null;
}

function artifactDirectUrl(
  artifact: ArtifactWithPublicationRecord
): string | null {
  return artifact.blobUrl || null;
}

function artifactPreview(artifact: ArtifactWithPublicationRecord) {
  if (artifact.kind === "image" && artifact.blobUrl) {
    return (
      <Image
        alt={artifact.title}
        className="max-h-44 w-auto rounded border object-contain"
        height={360}
        src={artifact.blobUrl}
        unoptimized
        width={640}
      />
    );
  }

  if (artifact.kind === "video" && artifact.blobUrl) {
    return (
      <video
        className="max-h-44 w-full rounded border"
        controls
        src={artifact.blobUrl}
      >
        <track kind="captions" />
      </video>
    );
  }

  if (artifact.kind === "web_page" && artifact.blobUrl) {
    return (
      <iframe
        className="h-44 w-full rounded border bg-background"
        sandbox="allow-scripts allow-same-origin"
        src={artifact.blobUrl}
        title={artifact.title}
      />
    );
  }

  if (artifact.inlineContent) {
    return (
      <pre className="max-h-44 overflow-auto rounded border bg-muted/40 p-2 font-mono text-xs">
        {artifact.inlineContent}
      </pre>
    );
  }

  if (artifact.kind === "url" && artifact.blobUrl) {
    return (
      <a
        className="inline-flex text-xs underline"
        href={artifact.blobUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        {artifact.blobUrl}
      </a>
    );
  }

  return (
    <div className="rounded border border-dashed bg-muted/30 p-3 text-muted-foreground text-xs">
      No inline preview available
    </div>
  );
}

function setParam(
  params: URLSearchParams,
  key: string,
  value: string | undefined
) {
  if (!value) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}

function toClientShareUrl(slug: string): string {
  if (typeof window === "undefined") {
    return `/a/${slug}`;
  }
  return `${window.location.origin}/a/${slug}`;
}

function toDownloadName(artifact: ArtifactWithPublicationRecord): string {
  const base = artifact.title
    .trim()
    .replace(INLINE_DOWNLOAD_SANITIZE_REGEX, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const extension = artifact.extension ? `.${artifact.extension}` : "";
  return `${base || "artifact"}${extension}`;
}

export function ArtifactPanel({
  workflowId,
  executionId,
  embedded = false,
  initialNodeFilter,
}: ArtifactPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<ArtifactWithPublicationRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState(() =>
    embedded ? "" : searchParams.get("q") || ""
  );
  const [kindFilter, setKindFilter] = useState<KindFilter>(() =>
    embedded ? "all" : parseKindFilter(searchParams.get("kind"))
  );
  const [dateFilter, setDateFilter] = useState<DateFilter>(() =>
    embedded ? "all" : parseDateFilter(searchParams.get("date"))
  );
  const [runFilter, setRunFilter] = useState<string>(() => {
    if (executionId) {
      return executionId;
    }
    return embedded ? "all" : searchParams.get("run") || "all";
  });
  const [nodeFilter, setNodeFilter] = useState<string>(() => {
    if (initialNodeFilter) {
      return initialNodeFilter;
    }
    return embedded ? "all" : searchParams.get("node") || "all";
  });
  const [previewArtifact, setPreviewArtifact] =
    useState<ArtifactWithPublicationRecord | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<ArtifactWithPublicationRecord | null>(null);
  const [publishTarget, setPublishTarget] =
    useState<ArtifactWithPublicationRecord | null>(null);
  const [publishSlug, setPublishSlug] = useState("");
  const [publishTitle, setPublishTitle] = useState("");
  const [publishDescription, setPublishDescription] = useState("");
  const [publishVisibility, setPublishVisibility] =
    useState<PublicationVisibility>("unlisted");
  const [publishing, setPublishing] = useState(false);

  const loadArtifacts = useCallback(
    async (cursor?: string, append = false) => {
      try {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        const result = await api.artifact.list({
          workflowId,
          executionId,
          cursor,
          q: query.trim() || undefined,
          kind: kindFilter === "all" ? undefined : kindFilter,
          limit: 30,
        });

        setItems((prev) =>
          append ? [...prev, ...result.items] : result.items
        );
        setNextCursor(result.nextCursor);
      } catch (error) {
        console.error("Failed to load artifacts:", error);
        toast.error("Failed to load artifacts");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [executionId, kindFilter, query, workflowId]
  );

  useEffect(() => {
    const load = async () => {
      await loadArtifacts();
    };

    load().catch((error) => {
      console.error("Failed to load artifacts:", error);
    });
  }, [loadArtifacts]);

  useEffect(() => {
    if (!initialNodeFilter) {
      return;
    }
    setNodeFilter(initialNodeFilter);
  }, [initialNodeFilter]);

  useEffect(() => {
    if (!executionId) {
      return;
    }
    setRunFilter(executionId);
  }, [executionId]);

  useEffect(() => {
    if (embedded) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    setParam(nextParams, "workflowId", workflowId);
    setParam(nextParams, "executionId", executionId);
    setParam(nextParams, "q", query.trim() || undefined);
    setParam(nextParams, "kind", kindFilter !== "all" ? kindFilter : undefined);
    setParam(nextParams, "date", dateFilter !== "all" ? dateFilter : undefined);
    setParam(nextParams, "run", runFilter !== "all" ? runFilter : undefined);
    setParam(nextParams, "node", nodeFilter !== "all" ? nodeFilter : undefined);
    nextParams.delete("cursor");

    const currentQueryString = searchParams.toString();
    const nextQueryString = nextParams.toString();
    if (currentQueryString === nextQueryString) {
      return;
    }

    router.replace(
      nextQueryString ? `${pathname}?${nextQueryString}` : pathname,
      { scroll: false }
    );
  }, [
    dateFilter,
    embedded,
    executionId,
    kindFilter,
    nodeFilter,
    pathname,
    query,
    router,
    runFilter,
    searchParams,
    workflowId,
  ]);

  const runOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of items) {
      if (item.executionId) {
        values.add(item.executionId);
      }
    }
    if (runFilter !== "all") {
      values.add(runFilter);
    }
    return [...values];
  }, [items, runFilter]);

  const nodeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of items) {
      values.add(item.nodeId);
    }
    if (nodeFilter !== "all") {
      values.add(nodeFilter);
    }
    return [...values];
  }, [items, nodeFilter]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (!passesDateFilter(item.createdAt, dateFilter)) {
          return false;
        }
        if (runFilter !== "all" && item.executionId !== runFilter) {
          return false;
        }
        if (nodeFilter !== "all" && item.nodeId !== nodeFilter) {
          return false;
        }
        return true;
      }),
    [dateFilter, items, nodeFilter, runFilter]
  );

  const hasVisualArtifacts = useMemo(
    () => filteredItems.some((item) => isVisualKind(item.kind)),
    [filteredItems]
  );

  const refresh = useCallback(async () => {
    await loadArtifacts();
  }, [loadArtifacts]);

  const handlePinToggle = async (artifact: ArtifactWithPublicationRecord) => {
    try {
      const updated = await api.artifact.update(artifact.id, {
        pinned: !artifact.pinned,
      });
      setItems((prev) =>
        prev.map((item) =>
          item.id === artifact.id ? { ...item, ...updated } : item
        )
      );
    } catch (error) {
      console.error("Failed to update artifact pin:", error);
      toast.error("Failed to update artifact pin");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await api.artifact.delete(deleteTarget.id);
      setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Artifact deleted");
    } catch (error) {
      console.error("Failed to delete artifact:", error);
      toast.error("Failed to delete artifact");
    }
  };

  const openPublishDialog = (artifact: ArtifactWithPublicationRecord) => {
    setPublishTarget(artifact);
    setPublishSlug(artifact.publication?.slug || "");
    setPublishTitle(artifact.publication?.title || artifact.title);
    setPublishDescription(artifact.publication?.description || "");
    setPublishVisibility(artifact.publication?.visibility || "unlisted");
  };

  const handlePublish = async (generateLayout: boolean) => {
    if (!publishTarget) {
      return;
    }

    setPublishing(true);
    try {
      if (generateLayout) {
        await api.artifact.composeUiSpec(publishTarget.id, {
          slug: publishSlug || undefined,
          title: publishTitle || undefined,
          description: publishDescription || undefined,
          visibility: publishVisibility,
        });
      } else {
        await api.artifact.publish(publishTarget.id, {
          slug: publishSlug || undefined,
          title: publishTitle || undefined,
          description: publishDescription || undefined,
          visibility: publishVisibility,
        });
      }
      setPublishTarget(null);
      await refresh();
      toast.success("Artifact published");
    } catch (error) {
      console.error("Failed to publish artifact:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to publish artifact"
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyLink = async (artifact: ArtifactWithPublicationRecord) => {
    const url = artifact.publication?.slug
      ? toClientShareUrl(artifact.publication.slug)
      : artifact.blobUrl;

    if (!url) {
      toast.error("No link available for this artifact");
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Artifact link copied");
    } catch (error) {
      console.error("Failed to copy artifact link:", error);
      toast.error("Failed to copy artifact link");
    }
  };

  const handleDownload = (artifact: ArtifactWithPublicationRecord) => {
    if (artifact.inlineContent) {
      const blob = new Blob([artifact.inlineContent], {
        type: artifact.mimeType || "text/plain",
      });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = toDownloadName(artifact);
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      return;
    }

    const directUrl = artifactDirectUrl(artifact);
    if (!directUrl) {
      toast.error("No downloadable content available");
      return;
    }

    const link = document.createElement("a");
    link.href = directUrl;
    link.download = toDownloadName(artifact);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.append(link);
    link.click();
    link.remove();
  };

  const artifactCards = filteredItems.map((artifact) => {
    const openUrl = artifactOpenUrl(artifact);
    return (
      <div className="rounded-lg border bg-card p-3" key={artifact.id}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium text-sm">{artifact.title}</div>
            <div className="text-muted-foreground text-xs">
              {artifact.kind} • {relativeDate(artifact.createdAt)} •{" "}
              {formatBytes(artifact.sizeBytes)}
            </div>
            {artifact.publication ? (
              <div className="mt-1 text-muted-foreground text-xs">
                Published as {artifact.publication.visibility}
              </div>
            ) : null}
          </div>
          {openUrl ? (
            <a
              className="rounded border p-1"
              href={openUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>

        {artifactPreview(artifact)}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setPreviewArtifact(artifact)}
            size="sm"
            variant="outline"
          >
            Preview
          </Button>
          {openUrl ? (
            <Button asChild size="sm" variant="outline">
              <a href={openUrl} rel="noopener noreferrer" target="_blank">
                Open
              </a>
            </Button>
          ) : null}
          <Button
            onClick={() => handleDownload(artifact)}
            size="sm"
            variant="outline"
          >
            Download
          </Button>
          <Button
            onClick={() => {
              handleCopyLink(artifact).catch((error) => {
                console.error("Failed to copy artifact link:", error);
              });
            }}
            size="sm"
            variant="outline"
          >
            <Link2 className="mr-1 size-3.5" />
            Copy Link
          </Button>
          <Button
            onClick={() => {
              handlePinToggle(artifact).catch((error) => {
                console.error("Failed to pin artifact:", error);
              });
            }}
            size="sm"
            variant="outline"
          >
            {artifact.pinned ? (
              <>
                <PinOff className="mr-1 size-3.5" />
                Unpin
              </>
            ) : (
              <>
                <Pin className="mr-1 size-3.5" />
                Pin
              </>
            )}
          </Button>
          <Button
            onClick={() => openPublishDialog(artifact)}
            size="sm"
            variant="outline"
          >
            {artifact.publication ? "Update Publish" : "Publish"}
          </Button>
          <Button
            onClick={() => setDeleteTarget(artifact)}
            size="sm"
            variant="outline"
          >
            <Trash2 className="mr-1 size-3.5" />
            Delete
          </Button>
        </div>
      </div>
    );
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-[180px] flex-1"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search artifacts..."
          value={query}
        />
        <Select
          onValueChange={(value) => setKindFilter(value as KindFilter)}
          value={kindFilter}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) => setDateFilter(value as DateFilter)}
          value={dateFilter}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Date" />
          </SelectTrigger>
          <SelectContent>
            {DATE_FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() => {
            refresh().catch((error) => {
              console.error("Failed to refresh artifacts:", error);
            });
          }}
          size="sm"
          variant="outline"
        >
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select onValueChange={setRunFilter} value={runFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Run" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All runs</SelectItem>
            {runOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={setNodeFilter} value={nodeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Node" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All nodes</SelectItem>
            {nodeOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!embedded && workflowId ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/app/workflows/${workflowId}`}>Back to workflow</Link>
          </Button>
        ) : null}
        {embedded && workflowId ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/app/library?workflowId=${workflowId}`}>
              Open Full Manager
            </Link>
          </Button>
        ) : null}
      </div>

      {(() => {
        if (loading) {
          return (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          );
        }

        if (filteredItems.length === 0) {
          return (
            <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
              {items.length === 0
                ? "No artifacts yet. Run an Agent Node and output artifacts/manifest.json."
                : "No artifacts match your filters."}
            </div>
          );
        }

        return (
          <div
            className={
              hasVisualArtifacts ? "grid gap-3 md:grid-cols-2" : "space-y-3"
            }
          >
            {artifactCards}
          </div>
        );
      })()}

      {nextCursor && (
        <div className="flex justify-center">
          <Button
            disabled={loadingMore}
            onClick={() => {
              loadArtifacts(nextCursor, true).catch((error) => {
                console.error("Failed to load more artifacts:", error);
              });
            }}
            size="sm"
            variant="outline"
          >
            {loadingMore ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setPreviewArtifact(null);
          }
        }}
        open={previewArtifact !== null}
      >
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewArtifact?.title}</DialogTitle>
          </DialogHeader>
          {previewArtifact ? artifactPreview(previewArtifact) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setPublishTarget(null);
          }
        }}
        open={publishTarget !== null}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publish Artifact</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="publish-title">Title</Label>
              <Input
                id="publish-title"
                onChange={(event) => setPublishTitle(event.target.value)}
                value={publishTitle}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="publish-slug">Slug</Label>
              <Input
                id="publish-slug"
                onChange={(event) => setPublishSlug(event.target.value)}
                placeholder="artifact-slug"
                value={publishSlug}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="publish-description">Description</Label>
              <Input
                id="publish-description"
                onChange={(event) => setPublishDescription(event.target.value)}
                value={publishDescription}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select
                onValueChange={(value) =>
                  setPublishVisibility(value as PublicationVisibility)
                }
                value={publishVisibility}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unlisted">Unlisted</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              disabled={publishing}
              onClick={() => {
                handlePublish(false).catch((error) => {
                  console.error("Failed to publish artifact:", error);
                });
              }}
              variant="outline"
            >
              Publish
            </Button>
            <Button
              disabled={publishing}
              onClick={() => {
                handlePublish(true).catch((error) => {
                  console.error("Failed to publish artifact:", error);
                });
              }}
            >
              Generate Layout + Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete artifact</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the artifact and its publication.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleDelete().catch((error) => {
                  console.error("Failed to delete artifact:", error);
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
