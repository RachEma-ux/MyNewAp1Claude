// VaultAdminPanel — no-deferral continuation-27 slice 114.
//
// Closes the partial-consumer gap on `vault.*` — 21 unconsumed
// endpoints across 5 functional groups (Membership / Attachments /
// Saved views / Templates / Notes & Search).
//
// Distinct from existing vault surfaces (BasesPanel α-shell + Vault
// Attachments / Saved Views / Templates pages); this panel exposes
// the operator admin chrome for the long-tail of vault primitives
// that didn't yet have a UI consumer.

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseJsonRecord(s: string): Record<string, unknown> | null {
  const trimmed = s.trim();
  if (trimmed === "") return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function VaultAdminPanel() {
  return (
    <div className="space-y-4" data-testid="vault-admin-panel">
      <MembershipCard />
      <AttachmentsCard />
      <SavedViewsCard />
      <TemplatesCard />
      <NotesAndSearchCard />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Membership
// ─────────────────────────────────────────────────────────────────

const VAULT_MEMBER_ROLES = ["reader", "writer", "admin"] as const;
type VaultMemberRole = (typeof VAULT_MEMBER_ROLES)[number];

function MembershipCard() {
  const [vaultId, setVaultId] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<VaultMemberRole>("reader");

  const parsedVault = parsePositiveInt(vaultId);
  const parsedUser = parsePositiveInt(userId);
  const formValid = parsedVault !== null && parsedUser !== null;

  const mut = trpc.agentStudio.vault.addMember.useMutation({
    onSuccess: () => {
      toast.success("Member added");
      setUserId("");
    },
    onError: (err) =>
      toast.error(`Add member failed: ${err.message ?? "unknown"}`),
  });

  function handleAdd() {
    if (!formValid) return;
    mut.mutate({
      vaultId: parsedVault as number,
      userId: parsedUser as number,
      role,
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Membership</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="vm-vault-id">Vault id</Label>
            <Input
              id="vm-vault-id"
              data-testid="vm-vault-id"
              type="number"
              min={1}
              value={vaultId}
              onChange={(e) => setVaultId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="vm-user-id">User id</Label>
            <Input
              id="vm-user-id"
              data-testid="vm-user-id"
              type="number"
              min={1}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="vm-role">Role</Label>
            <select
              id="vm-role"
              data-testid="vm-role"
              className="w-full rounded border bg-background p-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as VaultMemberRole)}
            >
              {VAULT_MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button
          type="button"
          disabled={!formValid || mut.isPending}
          onClick={handleAdd}
          data-testid="vm-add-button"
        >
          {mut.isPending ? "Adding…" : "Add member"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// Attachments
// ─────────────────────────────────────────────────────────────────

function AttachmentsCard() {
  const [createVaultId, setCreateVaultId] = useState("");
  const [filename, setFilename] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [size, setSize] = useState("");
  const [sha256, setSha256] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [linkAttachmentId, setLinkAttachmentId] = useState("");
  const [linkNoteId, setLinkNoteId] = useState("");
  const [markId, setMarkId] = useState("");

  const parsedCreateVault = parsePositiveInt(createVaultId);
  const parsedSize = parsePositiveInt(size);
  const createValid =
    parsedCreateVault !== null &&
    filename.trim().length > 0 &&
    mimeType.trim().length > 0 &&
    parsedSize !== null;

  const parsedLookup = parsePositiveInt(lookupId);
  const lookupQuery = trpc.agentStudio.vault.getAttachment.useQuery(
    parsedLookup !== null
      ? { attachmentId: parsedLookup }
      : (undefined as never),
    { enabled: parsedLookup !== null, refetchOnWindowFocus: false },
  );

  const parsedLinkAttachment = parsePositiveInt(linkAttachmentId);
  const parsedLinkNote = parsePositiveInt(linkNoteId);
  const linkValid =
    parsedLinkAttachment !== null && parsedLinkNote !== null;

  const parsedMark = parsePositiveInt(markId);
  const markValid = parsedMark !== null;

  const createMut = trpc.agentStudio.vault.createAttachment.useMutation({
    onSuccess: () => {
      toast.success("Attachment created");
      setFilename("");
      setMimeType("");
      setSize("");
      setSha256("");
    },
    onError: (err) =>
      toast.error(`Create attachment failed: ${err.message ?? "unknown"}`),
  });
  const linkMut = trpc.agentStudio.vault.linkAttachmentToNote.useMutation({
    onSuccess: () => toast.success("Linked"),
    onError: (err) =>
      toast.error(`Link failed: ${err.message ?? "unknown"}`),
  });
  const unlinkMut =
    trpc.agentStudio.vault.unlinkAttachmentFromNote.useMutation({
      onSuccess: () => toast.success("Unlinked"),
      onError: (err) =>
        toast.error(`Unlink failed: ${err.message ?? "unknown"}`),
    });
  const markMut =
    trpc.agentStudio.vault.markAttachmentAsSourceArtifact.useMutation({
      onSuccess: () => {
        toast.success("Marked as source artifact");
        setMarkId("");
      },
      onError: (err) =>
        toast.error(`Mark failed: ${err.message ?? "unknown"}`),
    });

  function handleCreate() {
    if (!createValid) return;
    createMut.mutate({
      vaultId: parsedCreateVault as number,
      filename: filename.trim(),
      mimeType: mimeType.trim(),
      size: parsedSize as number,
      ...(sha256.trim() !== "" ? { sha256: sha256.trim() } : {}),
    });
  }
  function handleLink() {
    if (!linkValid) return;
    linkMut.mutate({
      attachmentId: parsedLinkAttachment as number,
      noteId: parsedLinkNote as number,
    });
  }
  function handleUnlink() {
    if (!linkValid) return;
    unlinkMut.mutate({
      attachmentId: parsedLinkAttachment as number,
      noteId: parsedLinkNote as number,
    });
  }
  function handleMark() {
    if (!markValid) return;
    markMut.mutate({ attachmentId: parsedMark as number });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Attachments</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Create</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="va-vault-id">Vault id</Label>
              <Input
                id="va-vault-id"
                data-testid="va-create-vault-id"
                type="number"
                min={1}
                value={createVaultId}
                onChange={(e) => setCreateVaultId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="va-filename">Filename</Label>
              <Input
                id="va-filename"
                data-testid="va-create-filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="va-mime">MIME type</Label>
              <Input
                id="va-mime"
                data-testid="va-create-mime"
                value={mimeType}
                onChange={(e) => setMimeType(e.target.value)}
                placeholder="image/png"
              />
            </div>
            <div>
              <Label htmlFor="va-size">Size (bytes)</Label>
              <Input
                id="va-size"
                data-testid="va-create-size"
                type="number"
                min={1}
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="va-sha">SHA-256 (optional)</Label>
              <Input
                id="va-sha"
                data-testid="va-create-sha256"
                value={sha256}
                onChange={(e) => setSha256(e.target.value)}
                placeholder="64-char hex"
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={!createValid || createMut.isPending}
            onClick={handleCreate}
            data-testid="va-create-button"
          >
            {createMut.isPending ? "Creating…" : "Create attachment"}
          </Button>
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Lookup by id</SectionLabel>
          <Input
            data-testid="va-lookup-id"
            type="number"
            min={1}
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="attachment id"
          />
          {parsedLookup !== null ? (
            lookupQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : lookupQuery.error ? (
              <p
                className="text-sm text-destructive"
                data-testid="va-lookup-error"
              >
                {lookupQuery.error.message}
              </p>
            ) : lookupQuery.data ? (
              <pre
                className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
                data-testid="va-lookup-json"
              >
                {JSON.stringify(lookupQuery.data, null, 2)}
              </pre>
            ) : null
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Link / unlink</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="va-link-aid">Attachment id</Label>
              <Input
                id="va-link-aid"
                data-testid="va-link-aid"
                type="number"
                min={1}
                value={linkAttachmentId}
                onChange={(e) => setLinkAttachmentId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="va-link-nid">Note id</Label>
              <Input
                id="va-link-nid"
                data-testid="va-link-nid"
                type="number"
                min={1}
                value={linkNoteId}
                onChange={(e) => setLinkNoteId(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={!linkValid || linkMut.isPending}
              onClick={handleLink}
              data-testid="va-link-button"
            >
              {linkMut.isPending ? "Linking…" : "Link"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!linkValid || unlinkMut.isPending}
              onClick={handleUnlink}
              data-testid="va-unlink-button"
            >
              {unlinkMut.isPending ? "Unlinking…" : "Unlink"}
            </Button>
          </div>
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Mark as source artifact</SectionLabel>
          <Input
            data-testid="va-mark-id"
            type="number"
            min={1}
            value={markId}
            onChange={(e) => setMarkId(e.target.value)}
            placeholder="attachment id"
          />
          <Button
            type="button"
            disabled={!markValid || markMut.isPending}
            onClick={handleMark}
            data-testid="va-mark-button"
          >
            {markMut.isPending ? "Marking…" : "Mark"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// Saved views
// ─────────────────────────────────────────────────────────────────

function SavedViewsCard() {
  const [listVaultId, setListVaultId] = useState("");
  const [viewKindFilter, setViewKindFilter] = useState("");
  const [savedViewIdInput, setSavedViewIdInput] = useState("");
  const [versionIdInput, setVersionIdInput] = useState("");
  const [blueprintKindInput, setBlueprintKindInput] = useState("");

  const parsedListVault = parsePositiveInt(listVaultId);
  const listEnabled = parsedListVault !== null;
  const listQuery = trpc.agentStudio.vault.listSavedViews.useQuery(
    listEnabled
      ? {
          vaultId: parsedListVault as number,
          ...(viewKindFilter.trim() !== ""
            ? { viewKind: viewKindFilter.trim() }
            : {}),
        }
      : (undefined as never),
    { enabled: listEnabled, refetchOnWindowFocus: false },
  );

  const parsedSavedViewId = parsePositiveInt(savedViewIdInput);
  const detailQuery = trpc.agentStudio.vault.getSavedView.useQuery(
    parsedSavedViewId !== null
      ? { savedViewId: parsedSavedViewId }
      : (undefined as never),
    { enabled: parsedSavedViewId !== null, refetchOnWindowFocus: false },
  );

  const parsedVersionId = parsePositiveInt(versionIdInput);
  const versionQuery = trpc.agentStudio.vault.getSavedViewVersion.useQuery(
    parsedVersionId !== null
      ? { versionId: parsedVersionId }
      : (undefined as never),
    { enabled: parsedVersionId !== null, refetchOnWindowFocus: false },
  );

  const blueprintsQuery =
    trpc.agentStudio.vault.listViewKindBlueprints.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });
  const blueprintQuery = trpc.agentStudio.vault.getViewKindBlueprint.useQuery(
    blueprintKindInput.trim() !== ""
      ? { viewKind: blueprintKindInput.trim() }
      : (undefined as never),
    {
      enabled: blueprintKindInput.trim() !== "",
      refetchOnWindowFocus: false,
    },
  );

  const savedViews = (listQuery.data ?? []) as Array<{
    id: number;
    viewKind?: string;
    name?: string;
  }>;
  const blueprints = (blueprintsQuery.data ?? []) as Array<{
    viewKind: string;
    label?: string;
  }>;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Saved views</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>List</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="vs-list-vault">Vault id</Label>
              <Input
                id="vs-list-vault"
                data-testid="vs-list-vault-id"
                type="number"
                min={1}
                value={listVaultId}
                onChange={(e) => setListVaultId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="vs-list-kind">View kind filter (optional)</Label>
              <Input
                id="vs-list-kind"
                data-testid="vs-list-view-kind"
                value={viewKindFilter}
                onChange={(e) => setViewKindFilter(e.target.value)}
              />
            </div>
          </div>
          {listEnabled ? (
            listQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : listQuery.error ? (
              <p
                className="text-sm text-destructive"
                data-testid="vs-list-error"
              >
                {listQuery.error.message}
              </p>
            ) : savedViews.length === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="vs-list-empty"
              >
                No saved views for this vault.
              </p>
            ) : (
              <ul
                className="space-y-1"
                data-testid="vs-list-rows"
              >
                {savedViews.map((sv) => (
                  <li
                    key={sv.id}
                    className="rounded border bg-background p-2 font-mono text-xs"
                    data-testid="vs-list-row"
                  >
                    #{sv.id} {sv.viewKind ?? ""} {sv.name ?? ""}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Lookup saved view by id</SectionLabel>
          <Input
            data-testid="vs-detail-id"
            type="number"
            min={1}
            value={savedViewIdInput}
            onChange={(e) => setSavedViewIdInput(e.target.value)}
          />
          {parsedSavedViewId !== null && detailQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="vs-detail-json"
            >
              {JSON.stringify(detailQuery.data, null, 2)}
            </pre>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Lookup saved view version by id</SectionLabel>
          <Input
            data-testid="vs-version-id"
            type="number"
            min={1}
            value={versionIdInput}
            onChange={(e) => setVersionIdInput(e.target.value)}
          />
          {parsedVersionId !== null && versionQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="vs-version-json"
            >
              {JSON.stringify(versionQuery.data, null, 2)}
            </pre>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>View kind blueprints</SectionLabel>
          {blueprintsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : blueprints.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="vs-blueprints-empty"
            >
              No registered blueprints.
            </p>
          ) : (
            <ul
              className="space-y-1"
              data-testid="vs-blueprints-list"
            >
              {blueprints.map((b) => (
                <li
                  key={b.viewKind}
                  className="rounded border bg-background p-2 font-mono text-xs"
                  data-testid="vs-blueprint-row"
                >
                  {b.viewKind} {b.label ? `· ${b.label}` : ""}
                </li>
              ))}
            </ul>
          )}
          <div>
            <Label htmlFor="vs-blueprint-kind">Lookup blueprint by kind</Label>
            <Input
              id="vs-blueprint-kind"
              data-testid="vs-blueprint-kind"
              value={blueprintKindInput}
              onChange={(e) => setBlueprintKindInput(e.target.value)}
            />
          </div>
          {blueprintKindInput.trim() !== "" && blueprintQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="vs-blueprint-detail-json"
            >
              {JSON.stringify(blueprintQuery.data, null, 2)}
            </pre>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────

function TemplatesCard() {
  const [templateId, setTemplateId] = useState("");
  const [vaultId, setVaultId] = useState("");
  const [variables, setVariables] = useState("{}");
  const [countTemplateId, setCountTemplateId] = useState("");
  const [byNoteId, setByNoteId] = useState("");
  const [byTemplateId, setByTemplateId] = useState("");

  const parsedTemplateId = parsePositiveInt(templateId);
  const parsedVaultId = parsePositiveInt(vaultId);
  const parsedVariables = parseJsonRecord(variables);
  const createValid =
    parsedTemplateId !== null &&
    parsedVaultId !== null &&
    parsedVariables !== null;

  const parsedCountTemplate = parsePositiveInt(countTemplateId);
  const parsedByNote = parsePositiveInt(byNoteId);
  const parsedByTemplate = parsePositiveInt(byTemplateId);

  const countQuery =
    trpc.agentStudio.vault.countDistinctDigestsForTemplate.useQuery(
      parsedCountTemplate !== null
        ? { templateId: parsedCountTemplate }
        : (undefined as never),
      { enabled: parsedCountTemplate !== null, refetchOnWindowFocus: false },
    );
  const byNoteQuery =
    trpc.agentStudio.vault.listInstantiationsByNote.useQuery(
      parsedByNote !== null
        ? { noteId: parsedByNote }
        : (undefined as never),
      { enabled: parsedByNote !== null, refetchOnWindowFocus: false },
    );
  const byTemplateQuery =
    trpc.agentStudio.vault.listInstantiationsByTemplate.useQuery(
      parsedByTemplate !== null
        ? { templateId: parsedByTemplate }
        : (undefined as never),
      { enabled: parsedByTemplate !== null, refetchOnWindowFocus: false },
    );

  const utils = trpc.useUtils();
  const createMut = trpc.agentStudio.vault.createNoteFromTemplate.useMutation({
    onSuccess: () => {
      toast.success("Note created from template");
      setVariables("{}");
      if (parsedByTemplate !== null) {
        void utils.agentStudio.vault.listInstantiationsByTemplate.invalidate({
          templateId: parsedByTemplate,
        });
      }
    },
    onError: (err) =>
      toast.error(`Create-from-template failed: ${err.message ?? "unknown"}`),
  });

  function handleCreate() {
    if (!createValid) return;
    createMut.mutate({
      templateId: parsedTemplateId as number,
      vaultId: parsedVaultId as number,
      variables: parsedVariables as Record<string, unknown>,
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Templates</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Create note from template</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="vt-template-id">Template id</Label>
              <Input
                id="vt-template-id"
                data-testid="vt-create-template-id"
                type="number"
                min={1}
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="vt-vault-id">Vault id</Label>
              <Input
                id="vt-vault-id"
                data-testid="vt-create-vault-id"
                type="number"
                min={1}
                value={vaultId}
                onChange={(e) => setVaultId(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="vt-variables">Variables (JSON object)</Label>
              <textarea
                id="vt-variables"
                data-testid="vt-create-variables"
                className="w-full rounded border bg-background p-2 font-mono text-xs"
                rows={3}
                value={variables}
                onChange={(e) => setVariables(e.target.value)}
              />
              {parsedVariables === null ? (
                <p
                  className="mt-1 text-xs text-destructive"
                  data-testid="vt-variables-error"
                >
                  Variables must be a JSON object.
                </p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            disabled={!createValid || createMut.isPending}
            onClick={handleCreate}
            data-testid="vt-create-button"
          >
            {createMut.isPending ? "Creating…" : "Create note"}
          </Button>
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Count distinct digests for template</SectionLabel>
          <Input
            data-testid="vt-count-template-id"
            type="number"
            min={1}
            value={countTemplateId}
            onChange={(e) => setCountTemplateId(e.target.value)}
            placeholder="template id"
          />
          {parsedCountTemplate !== null && countQuery.data != null ? (
            <p
              className="font-mono text-xs"
              data-testid="vt-count-result"
            >
              {String(countQuery.data)}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Instantiations by note</SectionLabel>
          <Input
            data-testid="vt-by-note-id"
            type="number"
            min={1}
            value={byNoteId}
            onChange={(e) => setByNoteId(e.target.value)}
            placeholder="note id"
          />
          {parsedByNote !== null && byNoteQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="vt-by-note-json"
            >
              {JSON.stringify(byNoteQuery.data, null, 2)}
            </pre>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Instantiations by template</SectionLabel>
          <Input
            data-testid="vt-by-template-id"
            type="number"
            min={1}
            value={byTemplateId}
            onChange={(e) => setByTemplateId(e.target.value)}
            placeholder="template id"
          />
          {parsedByTemplate !== null && byTemplateQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="vt-by-template-json"
            >
              {JSON.stringify(byTemplateQuery.data, null, 2)}
            </pre>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// Notes & Search
// ─────────────────────────────────────────────────────────────────

function NotesAndSearchCard() {
  const [searchVaultId, setSearchVaultId] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState<{
    vaultId: number;
    q: string;
  } | null>(null);
  const [deleteNoteId, setDeleteNoteId] = useState("");
  const [exportNoteId, setExportNoteId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [importVaultId, setImportVaultId] = useState("");
  const [importFilename, setImportFilename] = useState("");
  const [importMarkdown, setImportMarkdown] = useState("");
  const [backfillVaultId, setBackfillVaultId] = useState("");

  const parsedSearchVault = parsePositiveInt(searchVaultId);
  const searchValid = parsedSearchVault !== null && searchQ.trim().length > 0;

  const searchQuery = trpc.agentStudio.vault.search.useQuery(
    searchSubmitted !== null
      ? { vaultId: searchSubmitted.vaultId, q: searchSubmitted.q }
      : (undefined as never),
    { enabled: searchSubmitted !== null, refetchOnWindowFocus: false },
  );

  const parsedDeleteNote = parsePositiveInt(deleteNoteId);
  const parsedExportNote = parsePositiveInt(exportNoteId);
  const exportQuery = trpc.agentStudio.vault.exportNote.useQuery(
    parsedExportNote !== null
      ? { noteId: parsedExportNote }
      : (undefined as never),
    { enabled: parsedExportNote !== null, refetchOnWindowFocus: false },
  );
  const parsedVersion = parsePositiveInt(versionId);
  const versionQuery = trpc.agentStudio.vault.getNoteVersion.useQuery(
    parsedVersion !== null
      ? { versionId: parsedVersion }
      : (undefined as never),
    { enabled: parsedVersion !== null, refetchOnWindowFocus: false },
  );

  const parsedImportVault = parsePositiveInt(importVaultId);
  const importValid =
    parsedImportVault !== null &&
    importFilename.trim().length > 0 &&
    importMarkdown.length > 0;
  const parsedBackfillVault = parsePositiveInt(backfillVaultId);

  const deleteMut = trpc.agentStudio.vault.deleteNote.useMutation({
    onSuccess: () => {
      toast.success(`Note #${parsedDeleteNote} deleted`);
      setDeleteNoteId("");
    },
    onError: (err) =>
      toast.error(`Delete failed: ${err.message ?? "unknown"}`),
  });
  const importMut = trpc.agentStudio.vault.importNoteFromMarkdown.useMutation({
    onSuccess: () => {
      toast.success("Note imported");
      setImportFilename("");
      setImportMarkdown("");
    },
    onError: (err) =>
      toast.error(`Import failed: ${err.message ?? "unknown"}`),
  });
  const backfillMut = trpc.agentStudio.vault.backfillLinks.useMutation({
    onSuccess: () => toast.success("Backfill complete"),
    onError: (err) =>
      toast.error(`Backfill failed: ${err.message ?? "unknown"}`),
  });

  function handleSearch() {
    if (!searchValid) return;
    setSearchSubmitted({
      vaultId: parsedSearchVault as number,
      q: searchQ.trim(),
    });
  }
  function handleDelete() {
    if (parsedDeleteNote === null) return;
    if (!window.confirm(`Delete note #${parsedDeleteNote}?`)) return;
    deleteMut.mutate({ noteId: parsedDeleteNote });
  }
  function handleImport() {
    if (!importValid) return;
    importMut.mutate({
      vaultId: parsedImportVault as number,
      filename: importFilename.trim(),
      markdown: importMarkdown,
    });
  }
  function handleBackfill() {
    if (parsedBackfillVault === null) return;
    if (
      !window.confirm(
        `Backfill wikilinks for vault #${parsedBackfillVault}? Vault-wide re-scan.`,
      )
    )
      return;
    backfillMut.mutate({ vaultId: parsedBackfillVault });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Notes & Search</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Search</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="vn-search-vault">Vault id</Label>
              <Input
                id="vn-search-vault"
                data-testid="vn-search-vault-id"
                type="number"
                min={1}
                value={searchVaultId}
                onChange={(e) => setSearchVaultId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="vn-search-q">Query</Label>
              <Input
                id="vn-search-q"
                data-testid="vn-search-q"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={!searchValid || searchQuery.isLoading}
            onClick={handleSearch}
            data-testid="vn-search-button"
          >
            {searchQuery.isLoading ? "Searching…" : "Search"}
          </Button>
          {searchQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="vn-search-result"
            >
              {JSON.stringify(searchQuery.data, null, 2)}
            </pre>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Delete note</SectionLabel>
          <Input
            data-testid="vn-delete-id"
            type="number"
            min={1}
            value={deleteNoteId}
            onChange={(e) => setDeleteNoteId(e.target.value)}
            placeholder="note id"
          />
          <Button
            type="button"
            variant="destructive"
            disabled={parsedDeleteNote === null || deleteMut.isPending}
            onClick={handleDelete}
            data-testid="vn-delete-button"
          >
            {deleteMut.isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Export note (markdown)</SectionLabel>
          <Input
            data-testid="vn-export-id"
            type="number"
            min={1}
            value={exportNoteId}
            onChange={(e) => setExportNoteId(e.target.value)}
            placeholder="note id"
          />
          {parsedExportNote !== null && exportQuery.data ? (
            <pre
              className="max-h-64 overflow-x-auto overflow-y-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="vn-export-markdown"
            >
              {String(
                (exportQuery.data as { markdown?: string }).markdown ??
                  JSON.stringify(exportQuery.data, null, 2),
              )}
            </pre>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Lookup note version by id</SectionLabel>
          <Input
            data-testid="vn-version-id"
            type="number"
            min={1}
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
          />
          {parsedVersion !== null && versionQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="vn-version-json"
            >
              {JSON.stringify(versionQuery.data, null, 2)}
            </pre>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Import note from markdown</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="vn-import-vault">Vault id</Label>
              <Input
                id="vn-import-vault"
                data-testid="vn-import-vault-id"
                type="number"
                min={1}
                value={importVaultId}
                onChange={(e) => setImportVaultId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="vn-import-filename">Filename</Label>
              <Input
                id="vn-import-filename"
                data-testid="vn-import-filename"
                value={importFilename}
                onChange={(e) => setImportFilename(e.target.value)}
                placeholder="my-note.md"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="vn-import-md">Markdown</Label>
              <textarea
                id="vn-import-md"
                data-testid="vn-import-markdown"
                className="w-full rounded border bg-background p-2 font-mono text-xs"
                rows={6}
                value={importMarkdown}
                onChange={(e) => setImportMarkdown(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={!importValid || importMut.isPending}
            onClick={handleImport}
            data-testid="vn-import-button"
          >
            {importMut.isPending ? "Importing…" : "Import"}
          </Button>
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Backfill wikilinks (vault-wide)</SectionLabel>
          <Input
            data-testid="vn-backfill-vault-id"
            type="number"
            min={1}
            value={backfillVaultId}
            onChange={(e) => setBackfillVaultId(e.target.value)}
            placeholder="vault id"
          />
          <Button
            type="button"
            variant="outline"
            disabled={parsedBackfillVault === null || backfillMut.isPending}
            onClick={handleBackfill}
            data-testid="vn-backfill-button"
          >
            {backfillMut.isPending ? "Backfilling…" : "Backfill links"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
