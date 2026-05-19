/**
 * AI Agent Studio — Marketplace Page (Phase 14c)
 *
 * Browse, refresh, install, and publish marketplace items. NO external
 * links — every UI button hits the local marketplace API.
 *
 * Operations:
 *   • Browse: filter by type / source / search
 *   • Refresh: pulls the official registry (or a custom URL)
 *   • Install: calls the installer service which materializes the
 *              payload into the catalog tables
 *   • Publish: opens a dialog to package an item from the local catalog
 *              (Phase 14c-β / no-deferral slice 21 — ships the operator-
 *              callable dialog in this page; was previously documented
 *              as "deferred to a follow-up — UI-side; backend already
 *              exists").
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  Store,
  RefreshCw,
  Download,
  Search as SearchIcon,
  Trash2,
  Upload,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
} from "../components/ui";

const SOURCE_COLORS: Record<string, string> = {
  local: "border-emerald-500/40 text-emerald-400",
  imported: "border-blue-500/40 text-blue-400",
  published: "border-purple-500/40 text-purple-400",
};

const TYPE_COLORS: Record<string, string> = {
  skill: "border-cyan-500/40 text-cyan-400",
  skill_pack: "border-cyan-500/40 text-cyan-400",
  tool: "border-amber-500/40 text-amber-400",
  tool_pack: "border-amber-500/40 text-amber-400",
  bundle: "border-violet-500/40 text-violet-400",
};

type PublishItemType = "skill" | "skill_pack" | "tool" | "tool_pack" | "bundle";

interface PublishFormState {
  itemKey: string;
  itemType: PublishItemType;
  displayName: string;
  description: string;
  author: string;
  version: string;
  tags: string;
  payloadJson: string;
}

const EMPTY_PUBLISH_FORM: PublishFormState = {
  itemKey: "",
  itemType: "skill",
  displayName: "",
  description: "",
  author: "",
  version: "0.1.0",
  tags: "",
  payloadJson: "{\n  \n}",
};

export default function AgentMarketplacePage() {
  const utils = trpc.useUtils();
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [publishOpen, setPublishOpen] = useState<boolean>(false);
  const [publishForm, setPublishForm] =
    useState<PublishFormState>(EMPTY_PUBLISH_FORM);
  const [publishPayloadError, setPublishPayloadError] = useState<string | null>(
    null,
  );

  const listQuery = trpc.agentStudio.marketplace.list.useQuery({
    itemType: (typeFilter || undefined) as any,
    source: (sourceFilter || undefined) as any,
    search: search || undefined,
  });
  const collectionsQuery = trpc.agentStudio.marketplace.listCollections.useQuery();

  const refreshMut = trpc.agentStudio.marketplace.refresh.useMutation({
    onSuccess: (r) => {
      toast.success(
        `Refreshed: ${r.fetched} fetched, ${r.inserted} new, ${r.skipped} already present, ${r.errors.length} errors`
      );
      utils.agentStudio.marketplace.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const installMut = trpc.agentStudio.marketplace.install.useMutation({
    onSuccess: (r) => {
      const total =
        (r.createdSkillIds?.length ?? 0) + (r.createdToolIds?.length ?? 0);
      toast.success(
        `Installed ${total} item(s) from ${r.itemKey}` +
          (r.skipped.length > 0 ? ` (${r.skipped.length} skipped)` : "")
      );
      utils.agentStudio.marketplace.list.invalidate();
      utils.agentStudio.catalogSkills.listMerged.invalidate();
      utils.agentStudio.catalogTools.listMerged.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const publishMut = trpc.agentStudio.marketplace.publish.useMutation({
    onSuccess: (r) => {
      toast.success(
        `Published "${(r as { displayName?: string }).displayName ?? publishForm.displayName}" to local marketplace`,
      );
      utils.agentStudio.marketplace.list.invalidate();
      setPublishOpen(false);
      setPublishForm(EMPTY_PUBLISH_FORM);
      setPublishPayloadError(null);
    },
    onError: (e) => toast.error(e.message),
  });

  function submitPublish() {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(publishForm.payloadJson);
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        throw new Error("payload must be a JSON object");
      }
    } catch (err) {
      setPublishPayloadError(
        err instanceof Error ? err.message : "invalid JSON",
      );
      return;
    }
    setPublishPayloadError(null);
    const tags = publishForm.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    publishMut.mutate({
      itemKey: publishForm.itemKey.trim(),
      itemType: publishForm.itemType,
      displayName: publishForm.displayName.trim(),
      description: publishForm.description.trim() || undefined,
      author: publishForm.author.trim() || undefined,
      version: publishForm.version.trim(),
      payload,
      tags: tags.length > 0 ? tags : undefined,
    });
  }

  const unpublishMut = trpc.agentStudio.marketplace.unpublish.useMutation({
    onSuccess: () => {
      toast.success("Unpublished");
      utils.agentStudio.marketplace.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleInstall(item: any) {
    if (
      !window.confirm(
        `Install "${item.displayName}" v${item.version} into the catalog?`
      )
    )
      return;
    installMut.mutate({
      itemId: item.id,
      onConflict: "skip",
    });
  }

  function handleUnpublish(item: any) {
    if (item.source !== "local") {
      toast.error("Only local items can be unpublished");
      return;
    }
    if (!window.confirm(`Unpublish "${item.displayName}"?`)) return;
    unpublishMut.mutate({ itemId: item.id });
  }

  if (listQuery.isLoading) return <LoadingState label="Loading marketplace…" />;

  const items = listQuery.data ?? [];
  const collections = collectionsQuery.data ?? [];

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Marketplace"
        subtitle="Agent Studio's own marketplace — browse, install, and publish skills + tools. Local-first, no external links."
        icon={<Store className="h-4 w-4 text-purple-500" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refreshMut.mutate({})}
              disabled={refreshMut.isPending}
              title="Pull latest items from the official registry"
            >
              {refreshMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
              )}
              Refresh Registry
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                setPublishForm(EMPTY_PUBLISH_FORM);
                setPublishPayloadError(null);
                setPublishOpen(true);
              }}
              title="Package and publish a local item to the marketplace"
              data-testid="marketplace-publish-button"
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              Publish
            </Button>
          </div>
        }
      />

      {/* Featured collections (if any) */}
      {collections.length > 0 && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70">
              Featured Collections
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {collections.map((c: any) => (
                <div
                  key={c.id}
                  className="border rounded p-2 text-[10px] space-y-0.5"
                >
                  <div className="font-semibold">{c.name}</div>
                  {c.description && (
                    <div className="text-muted-foreground line-clamp-2">
                      {c.description}
                    </div>
                  )}
                  <div className="text-[9px] text-muted-foreground/70">
                    {(c.itemKeys ?? []).length} items
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter row */}
      <Card>
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
            <Input
              placeholder="Search by key, name, description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs pl-7"
            />
          </div>
          <select
            className="h-7 px-2 rounded border bg-background text-xs"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            <option value="skill">Skill</option>
            <option value="skill_pack">Skill pack</option>
            <option value="tool">Tool</option>
            <option value="tool_pack">Tool pack</option>
            <option value="bundle">Bundle</option>
          </select>
          <select
            className="h-7 px-2 rounded border bg-background text-xs"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">All sources</option>
            <option value="local">Local</option>
            <option value="imported">Imported</option>
            <option value="published">Published</option>
          </select>
          <span className="text-[10px] text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"}
          </span>
        </CardContent>
      </Card>

      {/* Items list */}
      <Card>
        <CardContent className="p-3">
          {items.length === 0 ? (
            <EmptyState
              icon={<Store className="h-7 w-7" />}
              title="Marketplace is empty"
              description="Click Refresh Registry to pull the official catalog, or publish a local item from the Skills/Tools catalog."
              action={
                <Button
                  size="sm"
                  onClick={() => refreshMut.mutate({})}
                  disabled={refreshMut.isPending}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh Registry
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {items.map((item: any) => (
                <li
                  key={item.id}
                  className="border rounded p-3 text-xs space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        <span>{item.displayName}</span>
                        <Badge
                          variant="outline"
                          className={`text-[9px] uppercase tracking-wider ${
                            TYPE_COLORS[item.itemType] ?? ""
                          }`}
                        >
                          {item.itemType}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[9px] uppercase tracking-wider ${
                            SOURCE_COLORS[item.source] ?? ""
                          }`}
                        >
                          {item.source}
                        </Badge>
                        <span className="text-[9px] text-muted-foreground font-mono">
                          v{item.version}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/80 font-mono mt-0.5">
                        {item.itemKey}
                      </div>
                      {item.description && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {item.description}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-[9px] text-muted-foreground/70 mt-1">
                        <span>by {item.author ?? "anonymous"}</span>
                        <span>·</span>
                        <span>{item.installCount ?? 0} install{(item.installCount ?? 0) === 1 ? "" : "s"}</span>
                        {(item.tags ?? []).length > 0 && (
                          <>
                            <span>·</span>
                            <span className="font-mono">
                              {(item.tags ?? []).join(", ")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => handleInstall(item)}
                        disabled={installMut.isPending}
                      >
                        {installMut.isPending && installMut.variables?.itemId === item.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3 mr-1" />
                        )}
                        Install
                      </Button>
                      {item.source === "local" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => handleUnpublish(item)}
                          title="Unpublish (local items only)"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Footer note about publishing */}
      <Card>
        <CardContent className="p-3 text-[10px] text-muted-foreground space-y-1">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <strong>To publish to the local marketplace:</strong>
          </div>
          <div className="ml-4">
            Use the <strong>Publish</strong> button in the header, OR open the
            Skills / Tools Catalog page → select your item → Publish to
            Marketplace.
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <AlertCircle className="h-3 w-3 text-amber-500" />
            <strong>To submit to the official remote registry:</strong>
          </div>
          <div className="ml-4">
            File a PR against{" "}
            <code className="font-mono">
              docs/agent-studio/marketplace/registry.json
            </code>{" "}
            in the project repo. The Refresh Registry button pulls the latest
            from there. (No write API in Phase 14 — Decision #7.)
          </div>
        </CardContent>
      </Card>

      {/* Publish dialog — no-deferral slice 21 close-out. */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent
          className="max-w-xl"
          data-testid="marketplace-publish-dialog"
        >
          <DialogHeader>
            <DialogTitle>Publish to local marketplace</DialogTitle>
            <DialogDescription>
              Package an item from the local catalog and publish it as a row
              in the local marketplace registry. The Refresh Registry button
              will pick it up alongside imported items.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                  Item key
                </div>
                <Input
                  value={publishForm.itemKey}
                  onChange={(e) =>
                    setPublishForm((f) => ({ ...f, itemKey: e.target.value }))
                  }
                  placeholder="my-org/my-skill"
                  className="h-7 text-xs"
                  data-testid="publish-item-key"
                />
              </label>
              <label className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                  Item type
                </div>
                <select
                  value={publishForm.itemType}
                  onChange={(e) =>
                    setPublishForm((f) => ({
                      ...f,
                      itemType: e.target.value as PublishItemType,
                    }))
                  }
                  className="h-7 px-2 rounded border bg-background text-xs w-full"
                  data-testid="publish-item-type"
                >
                  <option value="skill">skill</option>
                  <option value="skill_pack">skill_pack</option>
                  <option value="tool">tool</option>
                  <option value="tool_pack">tool_pack</option>
                  <option value="bundle">bundle</option>
                </select>
              </label>
            </div>
            <label className="space-y-1 block">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                Display name
              </div>
              <Input
                value={publishForm.displayName}
                onChange={(e) =>
                  setPublishForm((f) => ({ ...f, displayName: e.target.value }))
                }
                className="h-7 text-xs"
                data-testid="publish-display-name"
              />
            </label>
            <label className="space-y-1 block">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                Description
              </div>
              <textarea
                value={publishForm.description}
                onChange={(e) =>
                  setPublishForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
                className="text-xs w-full rounded border bg-background p-1.5"
                data-testid="publish-description"
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                  Author
                </div>
                <Input
                  value={publishForm.author}
                  onChange={(e) =>
                    setPublishForm((f) => ({ ...f, author: e.target.value }))
                  }
                  className="h-7 text-xs"
                  data-testid="publish-author"
                />
              </label>
              <label className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                  Version
                </div>
                <Input
                  value={publishForm.version}
                  onChange={(e) =>
                    setPublishForm((f) => ({ ...f, version: e.target.value }))
                  }
                  placeholder="0.1.0"
                  className="h-7 text-xs font-mono"
                  data-testid="publish-version"
                />
              </label>
              <label className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                  Tags (comma-sep)
                </div>
                <Input
                  value={publishForm.tags}
                  onChange={(e) =>
                    setPublishForm((f) => ({ ...f, tags: e.target.value }))
                  }
                  className="h-7 text-xs"
                  data-testid="publish-tags"
                />
              </label>
            </div>
            <label className="space-y-1 block">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                Payload (JSON object — the catalog rows the installer will
                create)
              </div>
              <textarea
                value={publishForm.payloadJson}
                onChange={(e) =>
                  setPublishForm((f) => ({
                    ...f,
                    payloadJson: e.target.value,
                  }))
                }
                rows={8}
                className="text-[11px] font-mono w-full rounded border bg-background p-1.5"
                data-testid="publish-payload"
              />
              {publishPayloadError && (
                <div
                  className="text-[10px] text-red-500"
                  data-testid="publish-payload-error"
                >
                  Payload error: {publishPayloadError}
                </div>
              )}
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPublishOpen(false)}
              disabled={publishMut.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={submitPublish}
              disabled={
                publishMut.isPending ||
                !publishForm.itemKey.trim() ||
                !publishForm.displayName.trim() ||
                !publishForm.version.trim()
              }
              data-testid="publish-submit"
            >
              {publishMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1" />
              )}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
