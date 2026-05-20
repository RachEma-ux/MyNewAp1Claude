// CanvasAdminPanel — no-deferral continuation-30 slice 123.
//
// Closes the partial-consumer gap on `canvas.*` — 6 unconsumed
// endpoints (3 already consumed via existing canvas surfaces).
// 3 cards: Canvas (get + create), Node (create + update + delete),
// Edge (create).

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

const CANVAS_NODE_KINDS = [
  "note_ref",
  "embedded_query",
  "free_text",
  "image_ref",
] as const;
type CanvasNodeKind = (typeof CANVAS_NODE_KINDS)[number];

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseFloatOrNull(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseJsonRecord(s: string): Record<string, unknown> | null {
  const trimmed = s.trim();
  if (trimmed === "") return {};
  try {
    const v = JSON.parse(trimmed);
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    return v as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function CanvasAdminPanel() {
  return (
    <div className="space-y-4" data-testid="canvas-admin-panel">
      <CanvasCard />
      <NodeCard />
      <EdgeCard />
    </div>
  );
}

function CanvasCard() {
  const [lookupId, setLookupId] = useState("");
  const [vaultId, setVaultId] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const parsedLookup = parsePositiveInt(lookupId);
  const getQuery = trpc.agentStudio.canvas.get.useQuery(
    parsedLookup !== null ? { canvasId: parsedLookup } : (undefined as never),
    { enabled: parsedLookup !== null, refetchOnWindowFocus: false },
  );

  const parsedVault = parsePositiveInt(vaultId);
  const createValid =
    parsedVault !== null && slug.trim().length > 0 && title.trim().length > 0;

  const createMut = trpc.agentStudio.canvas.create.useMutation({
    onSuccess: () => {
      toast.success("Canvas created");
      setVaultId("");
      setSlug("");
      setTitle("");
      setDescription("");
    },
    onError: (err) =>
      toast.error(`Create canvas failed: ${err.message ?? "unknown"}`),
  });

  function handleCreate() {
    if (!createValid) return;
    createMut.mutate({
      vaultId: parsedVault as number,
      slug: slug.trim(),
      title: title.trim(),
      ...(description.trim() !== "" ? { description: description.trim() } : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Canvas</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Lookup by id</SectionLabel>
          <Input
            data-testid="ca-lookup-id"
            type="number"
            min={1}
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="canvas id"
          />
          {parsedLookup !== null && getQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="ca-lookup-json"
            >
              {JSON.stringify(getQuery.data, null, 2)}
            </pre>
          ) : parsedLookup !== null && getQuery.data === null ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="ca-lookup-missing"
            >
              Canvas not found.
            </p>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Create canvas</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ca-create-vault">Vault id</Label>
              <Input
                id="ca-create-vault"
                data-testid="ca-create-vault-id"
                type="number"
                min={1}
                value={vaultId}
                onChange={(e) => setVaultId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ca-create-slug">Slug</Label>
              <Input
                id="ca-create-slug"
                data-testid="ca-create-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                maxLength={255}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ca-create-title">Title</Label>
              <Input
                id="ca-create-title"
                data-testid="ca-create-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={255}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ca-create-desc">Description (optional)</Label>
              <Input
                id="ca-create-desc"
                data-testid="ca-create-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={!createValid || createMut.isPending}
            onClick={handleCreate}
            data-testid="ca-create-button"
          >
            {createMut.isPending ? "Creating…" : "Create canvas"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NodeCard() {
  const [createCanvasId, setCreateCanvasId] = useState("");
  const [createKind, setCreateKind] = useState<CanvasNodeKind>("free_text");
  const [createNoteRef, setCreateNoteRef] = useState("");
  const [createData, setCreateData] = useState("{}");

  const [updateNodeId, setUpdateNodeId] = useState("");
  const [updateKind, setUpdateKind] = useState<CanvasNodeKind | "">("");
  const [updateNoteRef, setUpdateNoteRef] = useState("");
  const [updateX, setUpdateX] = useState("");
  const [updateY, setUpdateY] = useState("");
  const [updateData, setUpdateData] = useState("");

  const [deleteNodeId, setDeleteNodeId] = useState("");

  const utils = trpc.useUtils();

  const parsedCreateCanvas = parsePositiveInt(createCanvasId);
  const parsedCreateNoteRef =
    createNoteRef.trim() === "" ? null : parsePositiveInt(createNoteRef);
  const createNoteRefValid =
    createNoteRef.trim() === "" || parsedCreateNoteRef !== null;
  const parsedCreateData = parseJsonRecord(createData);
  const createValid =
    parsedCreateCanvas !== null &&
    parsedCreateData !== null &&
    createNoteRefValid;

  const parsedUpdateNode = parsePositiveInt(updateNodeId);
  const parsedUpdateNoteRef =
    updateNoteRef.trim() === "" ? null : parsePositiveInt(updateNoteRef);
  const updateNoteRefValid =
    updateNoteRef.trim() === "" || parsedUpdateNoteRef !== null;
  const parsedUpdateData =
    updateData.trim() === "" ? null : parseJsonRecord(updateData);
  const updateDataValid = updateData.trim() === "" || parsedUpdateData !== null;
  const updateValid =
    parsedUpdateNode !== null && updateNoteRefValid && updateDataValid;

  const parsedDeleteNode = parsePositiveInt(deleteNodeId);

  const createMut = trpc.agentStudio.canvas.createNode.useMutation({
    onSuccess: () => {
      toast.success("Node created");
      setCreateNoteRef("");
      setCreateData("{}");
    },
    onError: (err) =>
      toast.error(`Create node failed: ${err.message ?? "unknown"}`),
  });

  const updateMut = trpc.agentStudio.canvas.updateNode.useMutation({
    onSuccess: () => {
      toast.success("Node updated");
    },
    onError: (err) =>
      toast.error(`Update node failed: ${err.message ?? "unknown"}`),
  });

  const deleteMut = trpc.agentStudio.canvas.deleteNode.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Delete: ${(res as { removed?: boolean }).removed ? "removed" : "noop"}`,
      );
      setDeleteNodeId("");
    },
    onError: (err) =>
      toast.error(`Delete node failed: ${err.message ?? "unknown"}`),
  });

  function handleCreate() {
    if (!createValid) return;
    createMut.mutate({
      canvasId: parsedCreateCanvas as number,
      kind: createKind,
      ...(parsedCreateNoteRef !== null
        ? { referencedNoteId: parsedCreateNoteRef }
        : {}),
      data: parsedCreateData as Record<string, unknown>,
    });
  }

  function handleUpdate() {
    if (!updateValid) return;
    const parsedUpdateX = updateX.trim() === "" ? null : parseFloatOrNull(updateX);
    const parsedUpdateY = updateY.trim() === "" ? null : parseFloatOrNull(updateY);
    updateMut.mutate({
      nodeId: parsedUpdateNode as number,
      ...(updateKind !== "" ? { kind: updateKind as CanvasNodeKind } : {}),
      ...(parsedUpdateNoteRef !== null
        ? { referencedNoteId: parsedUpdateNoteRef }
        : {}),
      ...(parsedUpdateX !== null ? { x: parsedUpdateX } : {}),
      ...(parsedUpdateY !== null ? { y: parsedUpdateY } : {}),
      ...(parsedUpdateData !== null
        ? { data: parsedUpdateData as Record<string, unknown> }
        : {}),
    });
  }

  function handleDelete() {
    if (parsedDeleteNode === null) return;
    if (!window.confirm(`Delete node #${parsedDeleteNode}?`)) return;
    deleteMut.mutate({ nodeId: parsedDeleteNode });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Node</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Create node</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cn-create-canvas">Canvas id</Label>
              <Input
                id="cn-create-canvas"
                data-testid="cn-create-canvas-id"
                type="number"
                min={1}
                value={createCanvasId}
                onChange={(e) => setCreateCanvasId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cn-create-kind">Kind</Label>
              <select
                id="cn-create-kind"
                data-testid="cn-create-kind"
                className="w-full rounded border bg-background p-2 text-sm"
                value={createKind}
                onChange={(e) => setCreateKind(e.target.value as CanvasNodeKind)}
              >
                {CANVAS_NODE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="cn-create-note">
                Referenced note id (optional)
              </Label>
              <Input
                id="cn-create-note"
                data-testid="cn-create-note-id"
                type="number"
                min={1}
                value={createNoteRef}
                onChange={(e) => setCreateNoteRef(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="cn-create-data">Data (JSON object)</Label>
              <textarea
                id="cn-create-data"
                data-testid="cn-create-data"
                className="w-full rounded border bg-background p-2 font-mono text-xs"
                rows={3}
                value={createData}
                onChange={(e) => setCreateData(e.target.value)}
              />
              {parsedCreateData === null ? (
                <p
                  className="text-xs text-destructive"
                  data-testid="cn-create-data-error"
                >
                  Data must be a JSON object.
                </p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            disabled={!createValid || createMut.isPending}
            onClick={handleCreate}
            data-testid="cn-create-button"
          >
            {createMut.isPending ? "Creating…" : "Create node"}
          </Button>
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Update node</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cn-update-node">Node id</Label>
              <Input
                id="cn-update-node"
                data-testid="cn-update-node-id"
                type="number"
                min={1}
                value={updateNodeId}
                onChange={(e) => setUpdateNodeId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cn-update-kind">Kind (optional)</Label>
              <select
                id="cn-update-kind"
                data-testid="cn-update-kind"
                className="w-full rounded border bg-background p-2 text-sm"
                value={updateKind}
                onChange={(e) =>
                  setUpdateKind(e.target.value as CanvasNodeKind | "")
                }
              >
                <option value="">(unchanged)</option>
                {CANVAS_NODE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="cn-update-note">
                Referenced note id (optional)
              </Label>
              <Input
                id="cn-update-note"
                data-testid="cn-update-note-id"
                type="number"
                min={1}
                value={updateNoteRef}
                onChange={(e) => setUpdateNoteRef(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="cn-update-x">X (optional)</Label>
                <Input
                  id="cn-update-x"
                  data-testid="cn-update-x"
                  type="number"
                  value={updateX}
                  onChange={(e) => setUpdateX(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cn-update-y">Y (optional)</Label>
                <Input
                  id="cn-update-y"
                  data-testid="cn-update-y"
                  type="number"
                  value={updateY}
                  onChange={(e) => setUpdateY(e.target.value)}
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="cn-update-data">
                Data (JSON object, optional)
              </Label>
              <textarea
                id="cn-update-data"
                data-testid="cn-update-data"
                className="w-full rounded border bg-background p-2 font-mono text-xs"
                rows={3}
                value={updateData}
                onChange={(e) => setUpdateData(e.target.value)}
              />
              {!updateDataValid ? (
                <p
                  className="text-xs text-destructive"
                  data-testid="cn-update-data-error"
                >
                  Data must be a JSON object.
                </p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            disabled={!updateValid || updateMut.isPending}
            onClick={handleUpdate}
            data-testid="cn-update-button"
          >
            {updateMut.isPending ? "Updating…" : "Update node"}
          </Button>
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Delete node</SectionLabel>
          <Input
            data-testid="cn-delete-node-id"
            type="number"
            min={1}
            value={deleteNodeId}
            onChange={(e) => setDeleteNodeId(e.target.value)}
            placeholder="node id"
          />
          <Button
            type="button"
            variant="destructive"
            disabled={parsedDeleteNode === null || deleteMut.isPending}
            onClick={handleDelete}
            data-testid="cn-delete-button"
          >
            {deleteMut.isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EdgeCard() {
  const [canvasId, setCanvasId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [relationshipKind, setRelationshipKind] = useState("");
  const [edgeData, setEdgeData] = useState("{}");

  const parsedCanvas = parsePositiveInt(canvasId);
  const parsedSource = parsePositiveInt(sourceId);
  const parsedTarget = parsePositiveInt(targetId);
  const parsedEdgeData = parseJsonRecord(edgeData);
  const formValid =
    parsedCanvas !== null &&
    parsedSource !== null &&
    parsedTarget !== null &&
    parsedEdgeData !== null;

  const createMut = trpc.agentStudio.canvas.createEdge.useMutation({
    onSuccess: () => {
      toast.success("Edge created");
      setRelationshipKind("");
      setEdgeData("{}");
    },
    onError: (err) =>
      toast.error(`Create edge failed: ${err.message ?? "unknown"}`),
  });

  function handleCreate() {
    if (!formValid) return;
    createMut.mutate({
      canvasId: parsedCanvas as number,
      sourceCanvasNodeId: parsedSource as number,
      targetCanvasNodeId: parsedTarget as number,
      ...(relationshipKind.trim() !== ""
        ? { relationshipKind: relationshipKind.trim() }
        : {}),
      data: parsedEdgeData as Record<string, unknown>,
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Edge</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="ce-canvas">Canvas id</Label>
            <Input
              id="ce-canvas"
              data-testid="ce-canvas-id"
              type="number"
              min={1}
              value={canvasId}
              onChange={(e) => setCanvasId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ce-source">Source node id</Label>
            <Input
              id="ce-source"
              data-testid="ce-source-id"
              type="number"
              min={1}
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ce-target">Target node id</Label>
            <Input
              id="ce-target"
              data-testid="ce-target-id"
              type="number"
              min={1}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="ce-rel">Relationship kind (optional)</Label>
            <Input
              id="ce-rel"
              data-testid="ce-relationship-kind"
              value={relationshipKind}
              onChange={(e) => setRelationshipKind(e.target.value)}
              maxLength={80}
              placeholder="e.g. references / contains"
            />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="ce-data">Data (JSON object)</Label>
            <textarea
              id="ce-data"
              data-testid="ce-data"
              className="w-full rounded border bg-background p-2 font-mono text-xs"
              rows={3}
              value={edgeData}
              onChange={(e) => setEdgeData(e.target.value)}
            />
            {parsedEdgeData === null ? (
              <p
                className="text-xs text-destructive"
                data-testid="ce-data-error"
              >
                Data must be a JSON object.
              </p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          disabled={!formValid || createMut.isPending}
          onClick={handleCreate}
          data-testid="ce-create-button"
        >
          {createMut.isPending ? "Creating…" : "Create edge"}
        </Button>
      </CardContent>
    </Card>
  );
}
