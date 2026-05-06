/**
 * RAC P11 — Source registry panel.
 *
 * Lists profiles for the agent's current draft and, on selection, the
 * sources bound to that profile. Each source row exposes inline
 * enable/disable + priority controls. Source creation uses the minimal
 * required-field set (sourceType + ownerModule); embedding overrides
 * land in a follow-up panel because they're catalog-bound.
 */

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { LoadingState, EmptyState, SectionLabel } from "./ui";

const SOURCE_TYPES = [
  "cag_pack",
  "memory",
  "document_collection",
  "vector_index",
  "graph_index",
  "workspace_context",
  "project_context",
  "tool_result_context",
  "manual_context",
  "external_connector",
] as const;

const OWNER_MODULES = [
  "agentStudio",
  "dataAnalysis",
  "projectsSystem",
  "external",
] as const;

interface Props {
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
  selectedProfileId: number | null;
  onSelectProfile: (id: number | null) => void;
}

export default function RacSourcesPanel({
  workspaceId,
  agentId,
  agentDraftId,
  selectedProfileId,
  onSelectProfile,
}: Props) {
  const utils = trpc.useUtils();
  const profilesQuery = trpc.agentStudio.racSources.profile.listForDraft.useQuery({
    agentDraftId,
  });
  const sourcesQuery = trpc.agentStudio.racSources.source.listForProfile.useQuery(
    { profileId: selectedProfileId ?? -1 },
    { enabled: selectedProfileId != null && selectedProfileId > 0 },
  );

  const [newProfileKey, setNewProfileKey] = useState("");
  const [newSourceType, setNewSourceType] =
    useState<(typeof SOURCE_TYPES)[number]>("document_collection");
  const [newOwnerModule, setNewOwnerModule] =
    useState<(typeof OWNER_MODULES)[number]>("agentStudio");
  const [newSourceName, setNewSourceName] = useState("");

  const createProfile =
    trpc.agentStudio.racSources.profile.create.useMutation({
      onSuccess: () => {
        toast.success("Profile created");
        setNewProfileKey("");
        void utils.agentStudio.racSources.profile.listForDraft.invalidate({
          agentDraftId,
        });
      },
      onError: (e) => toast.error(e.message),
    });
  const updateProfile =
    trpc.agentStudio.racSources.profile.update.useMutation({
      onSuccess: () => {
        void utils.agentStudio.racSources.profile.listForDraft.invalidate({
          agentDraftId,
        });
      },
      onError: (e) => toast.error(e.message),
    });
  const createSource = trpc.agentStudio.racSources.source.create.useMutation({
    onSuccess: () => {
      toast.success("Source added");
      setNewSourceName("");
      if (selectedProfileId) {
        void utils.agentStudio.racSources.source.listForProfile.invalidate({
          profileId: selectedProfileId,
        });
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const updateSource = trpc.agentStudio.racSources.source.update.useMutation({
    onSuccess: () => {
      if (selectedProfileId) {
        void utils.agentStudio.racSources.source.listForProfile.invalidate({
          profileId: selectedProfileId,
        });
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteSource = trpc.agentStudio.racSources.source.delete.useMutation({
    onSuccess: () => {
      toast.success("Source removed");
      if (selectedProfileId) {
        void utils.agentStudio.racSources.source.listForProfile.invalidate({
          profileId: selectedProfileId,
        });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const profiles = profilesQuery.data ?? [];
  const sources = sourcesQuery.data ?? [];
  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>Profiles</SectionLabel>
            <Badge variant="outline" className="text-[10px]">
              draft #{agentDraftId}
            </Badge>
          </div>
          {profilesQuery.isLoading && <LoadingState label="Loading profiles…" />}
          {!profilesQuery.isLoading && profiles.length === 0 && (
            <EmptyState
              title="No retrieval profiles yet"
              description="Create a profile to scope sources, evidence policies, and timeouts for this agent draft."
            />
          )}
          {profiles.length > 0 && (
            <ul className="space-y-1">
              {profiles.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between gap-2 px-2 py-1 rounded border ${
                    selectedProfileId === p.id
                      ? "border-emerald-700/50 bg-emerald-900/10"
                      : "border-border/50 hover:bg-accent/30"
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 text-left text-sm"
                    onClick={() => onSelectProfile(p.id)}
                  >
                    <div className="font-medium">{p.profileKey}</div>
                    <div className="text-[10px] text-muted-foreground">
                      timeoutMs: {p.timeoutMs ?? "—"} · {p.enabled ? "enabled" : "disabled"}
                    </div>
                  </button>
                  <Switch
                    checked={!!p.enabled}
                    onCheckedChange={(v) =>
                      updateProfile.mutate({ profileId: p.id, enabled: !!v })
                    }
                    aria-label="enabled"
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 pt-2 border-t border-border/40">
            <Input
              placeholder="profileKey (e.g. default)"
              value={newProfileKey}
              onChange={(e) => setNewProfileKey(e.target.value)}
              className="text-xs h-8"
            />
            <Button
              size="sm"
              onClick={() =>
                createProfile.mutate({
                  workspaceId,
                  agentId,
                  agentDraftId,
                  profileKey: newProfileKey || undefined,
                })
              }
              disabled={createProfile.isPending}
            >
              {createProfile.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3 mr-1" />
              )}
              Create profile
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>
              Sources{selectedProfile ? ` (profile: ${selectedProfile.profileKey})` : ""}
            </SectionLabel>
            <Badge variant="outline" className="text-[10px]">
              {sources.length} bound
            </Badge>
          </div>
          {!selectedProfileId && (
            <p className="text-xs text-muted-foreground">
              Select a profile above to inspect or edit its sources.
            </p>
          )}
          {selectedProfileId && sourcesQuery.isLoading && (
            <LoadingState label="Loading sources…" />
          )}
          {selectedProfileId && !sourcesQuery.isLoading && sources.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No sources yet — add one below.
            </p>
          )}
          {sources.length > 0 && (
            <ul className="space-y-1">
              {sources.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 text-sm border-b border-border/40 py-1"
                >
                  <Badge variant="outline" className="text-[10px]">
                    {s.sourceType}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {s.displayName || s.externalRefId || `source #${s.id}`}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      owner: {s.ownerModule} · priority: {s.priority ?? "—"}
                    </div>
                  </div>
                  <Input
                    type="number"
                    value={s.priority ?? 0}
                    onChange={(e) =>
                      updateSource.mutate({
                        sourceId: s.id,
                        priority: Number(e.target.value),
                      })
                    }
                    className="w-16 h-7 text-xs"
                  />
                  <Switch
                    checked={!!s.enabled}
                    onCheckedChange={(v) =>
                      updateSource.mutate({ sourceId: s.id, enabled: !!v })
                    }
                    aria-label="enabled"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteSource.mutate({ sourceId: s.id })}
                    disabled={deleteSource.isPending}
                  >
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {selectedProfileId && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
              <div>
                <Label className="text-xs">Source type</Label>
                <Select
                  value={newSourceType}
                  onValueChange={(v) => setNewSourceType(v as (typeof SOURCE_TYPES)[number])}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Owner module</Label>
                <Select
                  value={newOwnerModule}
                  onValueChange={(v) => setNewOwnerModule(v as (typeof OWNER_MODULES)[number])}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OWNER_MODULES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Display name (optional)</Label>
                <Input
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="e.g. Engineering Wiki"
                />
              </div>
              <div className="col-span-2">
                <Button
                  size="sm"
                  onClick={() =>
                    createSource.mutate({
                      workspaceId,
                      profileId: selectedProfileId,
                      sourceType: newSourceType,
                      ownerModule: newOwnerModule,
                      displayName: newSourceName || undefined,
                    })
                  }
                  disabled={createSource.isPending}
                >
                  {createSource.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Plus className="h-3 w-3 mr-1" />
                  )}
                  Add source
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
