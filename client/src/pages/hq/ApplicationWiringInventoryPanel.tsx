/**
 * Digital HQ — Application Wiring Inventory panel.
 *
 * Single-page surface that wires `hq.applicationWiring.{summary,
 * matrix, blockers, missing, readiness, graph}` into a scannable
 * dashboard. Module rows in the matrix are clickable to drill into a
 * detail card with per-area evidence.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
  Network,
  AlertTriangle,
  CircleSlash,
  CircleCheck,
  GitBranch,
} from "lucide-react";
import { WiringMatrixTable } from "@/components/digital-hq/WiringMatrixTable";

export default function ApplicationWiringInventoryPanel() {
  const matrixQ = trpc.hq.applicationWiring.matrix.useQuery();
  const blockersQ = trpc.hq.applicationWiring.blockers.useQuery();
  const missingQ = trpc.hq.applicationWiring.missing.useQuery();
  const graphQ = trpc.hq.applicationWiring.graph.useQuery();

  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  const isLoading = matrixQ.isLoading;
  const error = matrixQ.error ?? blockersQ.error ?? missingQ.error ?? graphQ.error;

  const summary = matrixQ.data?.summary;
  const modules = matrixQ.data?.modules ?? [];
  const columns = matrixQ.data?.columns ?? [];

  const selected = useMemo(
    () => modules.find((m) => m.moduleKey === selectedModule) ?? null,
    [modules, selectedModule],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-center py-12">
        Failed to load wiring inventory: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Application Wiring Inventory</h1>
        <p className="text-muted-foreground mt-1">
          Per-module integration matrix, dependency graph, and readiness scoring
          across the modular platform.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <SummaryCard
          title="Modules"
          value={summary?.moduleCount ?? 0}
          icon={<Network className="h-4 w-4 text-muted-foreground" />}
        />
        <SummaryCard
          title="Fully wired"
          value={summary?.fullyWiredCount ?? 0}
          icon={<CircleCheck className="h-4 w-4 text-emerald-500" />}
        />
        <SummaryCard
          title="Mostly / partial"
          value={(summary?.mostlyWiredCount ?? 0) + (summary?.partialCount ?? 0)}
          icon={<CircleSlash className="h-4 w-4 text-amber-500" />}
        />
        <SummaryCard
          title="Blocked"
          value={summary?.blockedCount ?? 0}
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
        />
        <SummaryCard
          title="Avg readiness"
          value={summary?.averageReadinessScore ?? 0}
          icon={<GitBranch className="h-4 w-4 text-muted-foreground" />}
          suffix="%"
        />
        <SummaryCard
          title="Missing required"
          value={summary?.missingRequiredWires ?? 0}
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
        />
      </div>

      {/* Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Wiring Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <WiringMatrixTable
            modules={modules}
            columns={columns}
            onModuleClick={setSelectedModule}
          />
          <p className="text-xs text-muted-foreground mt-3">
            Click a module to view per-area evidence, blockers, dependencies.
          </p>
        </CardContent>
      </Card>

      {/* Module detail */}
      {selected && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <CardTitle>
                {selected.moduleName} <span className="text-muted-foreground text-sm">({selected.moduleKey})</span>
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedModule(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge>{selected.readinessStatus}</Badge>
              <span className="text-sm">
                Score: <span className="font-bold tabular-nums">{selected.readinessScore}</span>
              </span>
              {selected.runtimeMode && (
                <Badge variant="outline">runtime: {selected.runtimeMode}</Badge>
              )}
              {selected.databaseKind && (
                <Badge variant="outline">db: {selected.databaseKind}</Badge>
              )}
              {selected.lifecycleStatus && (
                <Badge variant="secondary">{selected.lifecycleStatus}</Badge>
              )}
            </div>

            {selected.blockers.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-1 text-destructive">Blockers</h4>
                <ul className="text-xs space-y-1">
                  {selected.blockers.map((b, i) => (
                    <li key={i} className="font-mono">{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {selected.warnings.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-1 text-amber-600">Warnings</h4>
                <ul className="text-xs space-y-1">
                  {selected.warnings.map((w, i) => (
                    <li key={i} className="font-mono">{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="text-sm font-medium mb-1">Areas</h4>
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    <th className="text-left py-1 px-2">Area</th>
                    <th className="text-left py-1 px-2">Status</th>
                    <th className="text-right py-1 px-2">Score</th>
                    <th className="text-left py-1 px-2">Notes / missing</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.areas.map((a) => (
                    <tr key={a.area} className="border-b last:border-0">
                      <td className="py-1 px-2 font-medium">{a.area}</td>
                      <td className="py-1 px-2">{a.status}</td>
                      <td className="py-1 px-2 text-right tabular-nums">{a.score}</td>
                      <td className="py-1 px-2 text-muted-foreground">
                        {a.notes ?? a.missing.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected.dependencies.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-1">Dependencies</h4>
                <ul className="text-xs space-y-1 font-mono">
                  {selected.dependencies.map((d, i) => (
                    <li key={i}>
                      {d.dependencyType} → {d.target}{" "}
                      {d.required && <Badge variant="destructive">required</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Blockers + Missing */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Modules with blockers</CardTitle>
          </CardHeader>
          <CardContent>
            {blockersQ.data && blockersQ.data.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {blockersQ.data.map((b) => (
                  <li key={b.moduleKey} className="border rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{b.moduleName}</span>
                      <Badge variant="destructive">{b.readinessScore}</Badge>
                    </div>
                    <ul className="text-xs mt-1 space-y-0.5 text-muted-foreground font-mono">
                      {b.blockers.map((x, i) => <li key={i}>• {x}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No blockers.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Missing / partial wires</CardTitle>
          </CardHeader>
          <CardContent>
            {missingQ.data ? (
              <div className="space-y-2 text-xs">
                <Section label="Missing required" rows={missingQ.data.missing} />
                <Section label="Broken" rows={missingQ.data.broken} />
                <Section label="Declared-only" rows={missingQ.data.declaredOnly} />
                <Section label="Partial" rows={missingQ.data.partial} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dependency graph (list view) */}
      <Card>
        <CardHeader>
          <CardTitle>Dependency Graph</CardTitle>
        </CardHeader>
        <CardContent>
          {graphQ.data?.cycles && graphQ.data.cycles.length > 0 && (
            <div className="mb-3 text-sm text-destructive">
              ⚠️ {graphQ.data.cycles.length} cycle(s) detected:{" "}
              {graphQ.data.cycles.map((c) => c.join(" → ")).join(" · ")}
            </div>
          )}
          <p className="text-xs text-muted-foreground mb-2">
            {graphQ.data?.nodes.length ?? 0} nodes · {graphQ.data?.edges.length ?? 0} edges
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {graphQ.data?.nodes
              .filter((n) => n.type === "module")
              .map((n) => {
                const outgoing = graphQ.data!.edges.filter((e) => e.source === n.id);
                return (
                  <div key={n.id} className="border rounded-md p-2 text-xs">
                    <div className="font-medium">{n.label}</div>
                    <div className="text-muted-foreground mt-1">
                      {outgoing.length === 0
                        ? "no dependencies"
                        : outgoing.map((e) => `${e.type}: ${e.target}`).join(" · ")}
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  suffix,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  suffix?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">
          {value}
          {suffix}
        </div>
      </CardContent>
    </Card>
  );
}

function Section({
  label,
  rows,
}: {
  label: string;
  rows: Array<{ moduleKey: string; area: string; missing: string[] }>;
}) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <div className="font-medium mb-1">{label} ({rows.length})</div>
      <ul className="space-y-0.5 font-mono text-muted-foreground">
        {rows.slice(0, 8).map((r, i) => (
          <li key={i}>
            {r.moduleKey} · {r.area}
            {r.missing.length > 0 && ` — ${r.missing.slice(0, 2).join(", ")}${r.missing.length > 2 ? "…" : ""}`}
          </li>
        ))}
        {rows.length > 8 && (
          <li className="text-muted-foreground/70">…and {rows.length - 8} more</li>
        )}
      </ul>
    </div>
  );
}
