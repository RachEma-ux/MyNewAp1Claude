// VaultTemplatesPanel — operator UI for the vault template library.
//
// Phase 15 (Templates + Attachments standalone scope, V1.5). Backs
// onto the existing tRPC procedures:
//   - agentStudio.vault.listTemplates({ vaultId? })
//   - agentStudio.vault.createTemplate({ ... })
//
// MVP: list templates + create dialog. Edit / delete / render-and-
// instantiate flow into operator UI follow-on. The seed loader at
// `seedVaultTemplateRows` already populates the catalog, so this
// panel is the first operator-facing surface that lets a human
// inspect what's been seeded and add new templates.
//
// Hard-rule compliance:
//   - No `process.env.*_API_KEY` reads (client-side panel).
//   - All mutations route through tRPC; no direct ASDB writes.

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionLabel } from "./ui";

export function VaultTemplatesPanel() {
  const [vaultIdFilter, setVaultIdFilter] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [draftVaultId, setDraftVaultId] = useState("");
  const [draftBody, setDraftBody] = useState("");

  const parsedFilter = parseOptionalPositive(vaultIdFilter);
  const listingQuery =
    trpc.agentStudio.vault.listTemplates.useQuery(
      parsedFilter !== null ? { vaultId: parsedFilter } : {},
      { refetchInterval: 60_000 },
    );
  const utils = trpc.useUtils();

  const createMut = trpc.agentStudio.vault.createTemplate.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Template "${data?.templateKey ?? draftKey}" created`,
      );
      setShowCreate(false);
      setDraftName("");
      setDraftKey("");
      setDraftVaultId("");
      setDraftBody("");
      void utils.agentStudio.vault.listTemplates.invalidate();
    },
    onError: (err) =>
      toast.error(`Create failed: ${err.message ?? "unknown"}`),
  });

  function handleCreate() {
    const trimmedKey = draftKey.trim();
    const trimmedName = draftName.trim();
    if (trimmedKey.length === 0 || trimmedName.length === 0) {
      toast.error("Template key + name are required");
      return;
    }
    const vaultId = parseOptionalPositive(draftVaultId);
    createMut.mutate({
      templateKey: trimmedKey,
      name: trimmedName,
      contentMd: draftBody,
      ...(vaultId !== null ? { vaultId } : {}),
    });
  }

  const templates = Array.isArray(listingQuery.data?.templates)
    ? listingQuery.data.templates
    : [];

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Vault templates</SectionLabel>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowCreate((s) => !s)}
              data-testid="vault-templates-toggle-create"
            >
              {showCreate ? "Cancel" : "New template"}
            </Button>
          </div>

          <div className="text-xs text-zinc-400">
            Backs onto <code>agentStudio.vault.listTemplates</code> +{" "}
            <code>createTemplate</code>. Per-vault filter optional;
            workspace-global templates leave the filter blank. Seed
            rows are bootstrapped by{" "}
            <code>seedVaultTemplateRows</code> at boot.
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="vault-templates-vault-filter"
                className="text-xs text-zinc-400"
              >
                Filter by vault id (optional)
              </Label>
              <Input
                id="vault-templates-vault-filter"
                type="number"
                min={1}
                value={vaultIdFilter}
                onChange={(e) => setVaultIdFilter(e.target.value)}
                placeholder="all vaults"
                className="w-40"
                data-testid="vault-templates-vault-filter"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void listingQuery.refetch()}
            >
              Refresh
            </Button>
          </div>

          {showCreate ? (
            <div className="space-y-2 rounded border border-zinc-800 p-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor="vault-templates-draft-key"
                    className="text-xs text-zinc-400"
                  >
                    Template key
                  </Label>
                  <Input
                    id="vault-templates-draft-key"
                    value={draftKey}
                    onChange={(e) => setDraftKey(e.target.value)}
                    placeholder="weekly-review"
                    maxLength={100}
                    data-testid="vault-templates-draft-key"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor="vault-templates-draft-name"
                    className="text-xs text-zinc-400"
                  >
                    Display name
                  </Label>
                  <Input
                    id="vault-templates-draft-name"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Weekly review"
                    maxLength={255}
                    data-testid="vault-templates-draft-name"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor="vault-templates-draft-vault"
                    className="text-xs text-zinc-400"
                  >
                    Vault id (blank = global)
                  </Label>
                  <Input
                    id="vault-templates-draft-vault"
                    type="number"
                    min={1}
                    value={draftVaultId}
                    onChange={(e) => setDraftVaultId(e.target.value)}
                    placeholder="(global)"
                    data-testid="vault-templates-draft-vault"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor="vault-templates-draft-body"
                  className="text-xs text-zinc-400"
                >
                  Body (Markdown)
                </Label>
                <Textarea
                  id="vault-templates-draft-body"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  rows={6}
                  placeholder="# {{title}}&#10;&#10;..."
                  maxLength={200_000}
                  data-testid="vault-templates-draft-body"
                />
              </div>
              <Button
                variant="default"
                onClick={handleCreate}
                disabled={createMut.isPending}
                data-testid="vault-templates-create-submit"
              >
                {createMut.isPending ? "Creating…" : "Create template"}
              </Button>
            </div>
          ) : null}

          <div className="space-y-2">
            {listingQuery.isLoading ? (
              <div className="text-sm text-zinc-400">Loading templates…</div>
            ) : null}
            {!listingQuery.isLoading && templates.length === 0 ? (
              <div className="rounded border border-zinc-800 p-3 text-sm text-zinc-400">
                No templates yet
                {parsedFilter !== null ? ` for vault ${parsedFilter}` : ""}.
              </div>
            ) : null}
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded border border-zinc-800 p-3 text-sm"
                data-testid="vault-templates-row"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">
                    {t.name}{" "}
                    <span className="text-xs text-zinc-400">
                      ({t.templateKey})
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {t.vaultId == null
                      ? "global"
                      : `vault ${t.vaultId}`}
                  </div>
                </div>
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-zinc-300">
                    Body preview
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-zinc-200">
                    {t.contentMd}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function parseOptionalPositive(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const parsed = parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
