/**
 * Canvas operator panel — V1+ Phase 17 closure. PR-V1-171.
 *
 * First UI consumer of the canvas tRPC router shipped in #921.
 * Read-only operator browser: pick a vault, list canvases in it,
 * drill into one to see node + edge counts + note-reference list.
 *
 * Scope is intentionally minimal — an interactive canvas editor
 * (drag/drop nodes, draw edges) is a much larger UX investment.
 * This panel surfaces the data so operators can confirm Phase 17 is
 * functioning end-to-end + inspect existing canvases without
 * direct DB queries.
 *
 * Pattern mirrors #908 RegionAdminPanel + #914 ExtensionsAdminPanel.
 */

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { SectionLabel } from "./ui";

function fmtTs(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").replace(/\..+$/, "Z");
}

interface Props {
  /** Default vault to browse on first mount. */
  readonly initialVaultId?: number;
}

export function CanvasOperatorPanel({ initialVaultId = 1 }: Props) {
  const [vaultId, setVaultId] = useState<number>(initialVaultId);
  const [selectedCanvasId, setSelectedCanvasId] = useState<number | null>(
    null,
  );

  const listQ = trpc.agentStudio.canvas.listByVault.useQuery(
    { vaultId },
    { refetchOnWindowFocus: false },
  );
  const snapshotQ = trpc.agentStudio.canvas.getSnapshot.useQuery(
    selectedCanvasId != null ? { canvasId: selectedCanvasId } : undefined,
    {
      enabled: selectedCanvasId != null,
      refetchOnWindowFocus: false,
    },
  );
  const refsQ = trpc.agentStudio.canvas.listNoteReferences.useQuery(
    selectedCanvasId != null ? { canvasId: selectedCanvasId } : undefined,
    {
      enabled: selectedCanvasId != null,
      refetchOnWindowFocus: false,
    },
  );

  return (
    <div className="space-y-4">
      {/* Vault selector */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Vault selector</SectionLabel>
          <div className="flex items-center gap-2 text-sm">
            <label className="font-medium" htmlFor="canvas-op-vault-id">
              Vault ID:
            </label>
            <Input
              id="canvas-op-vault-id"
              type="number"
              min={1}
              className="w-24"
              value={vaultId}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(next) && next > 0) setVaultId(next);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Canvases list */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Canvases in vault {vaultId}</SectionLabel>
          {listQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading canvases…</p>
          ) : listQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load canvases: {listQ.error.message}
            </p>
          ) : !listQ.data || listQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No canvases in this vault.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">ID</th>
                    <th className="py-1 pr-3">Slug</th>
                    <th className="py-1 pr-3">Title</th>
                    <th className="py-1 pr-3">Updated</th>
                    <th className="py-1 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.data.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="py-1 pr-3 font-mono">{c.id}</td>
                      <td className="py-1 pr-3 font-mono text-xs">
                        {c.slug}
                      </td>
                      <td className="py-1 pr-3">{c.title}</td>
                      <td className="py-1 pr-3">{fmtTs(c.updatedAt)}</td>
                      <td className="py-1 pr-3">
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={() => setSelectedCanvasId(c.id)}
                        >
                          inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected canvas snapshot */}
      {selectedCanvasId != null && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <SectionLabel>Canvas {selectedCanvasId} snapshot</SectionLabel>
            {snapshotQ.isLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading snapshot…
              </p>
            ) : snapshotQ.error ? (
              <p className="text-sm text-destructive">
                Failed to load snapshot: {snapshotQ.error.message}
              </p>
            ) : snapshotQ.data == null ? (
              <p className="text-sm text-muted-foreground">
                Canvas not found.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="font-medium">Nodes:</span>{" "}
                    {snapshotQ.data.nodes.length}
                  </div>
                  <div>
                    <span className="font-medium">Edges:</span>{" "}
                    {snapshotQ.data.edges.length}
                  </div>
                  <div>
                    <span className="font-medium">Vault:</span>{" "}
                    {snapshotQ.data.canvas.vaultId}
                  </div>
                </div>
                {/* PR-V1-216: per-kind breakdown of the nodes. The
                    nodes total tells operators how heavy the canvas
                    is; the kind breakdown tells what TYPE of heavy.
                    Closed taxonomy: note_ref / embedded_query /
                    free_text / image_ref. */}
                {snapshotQ.data.nodes.length > 0 ? (
                  <p
                    className="text-xs text-muted-foreground mt-1"
                    data-testid="canvas-snapshot-kind-breakdown"
                  >
                    {(() => {
                      const counts = {
                        note_ref: 0,
                        embedded_query: 0,
                        free_text: 0,
                        image_ref: 0,
                      };
                      for (const n of snapshotQ.data.nodes) {
                        if (n.kind in counts) {
                          counts[n.kind as keyof typeof counts] += 1;
                        }
                      }
                      return (
                        <>
                          <span className="font-medium">By kind:</span>{" "}
                          <span className="font-mono">{counts.note_ref}</span>{" "}
                          note_ref /{" "}
                          <span className="font-mono">
                            {counts.embedded_query}
                          </span>{" "}
                          embedded_query /{" "}
                          <span className="font-mono">{counts.free_text}</span>{" "}
                          free_text /{" "}
                          <span className="font-mono">{counts.image_ref}</span>{" "}
                          image_ref
                        </>
                      );
                    })()}
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Selected canvas note references */}
      {selectedCanvasId != null && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <SectionLabel>Note references on canvas {selectedCanvasId}</SectionLabel>
            {refsQ.isLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading references…
              </p>
            ) : refsQ.error ? (
              <p className="text-sm text-destructive">
                Failed to load references: {refsQ.error.message}
              </p>
            ) : !refsQ.data || refsQ.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No note references on this canvas.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-3">Node ID</th>
                      <th className="py-1 pr-3">Referenced note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refsQ.data.map((r) => (
                      <tr key={r.nodeId} className="border-t">
                        <td className="py-1 pr-3 font-mono">{r.nodeId}</td>
                        <td className="py-1 pr-3 font-mono">{r.noteId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
