/**
 * Digital HQ — Wiring Matrix table.
 *
 * Renders the per-module × per-area matrix returned by
 * hq.applicationWiring.matrix. Status badges are color-coded so the
 * eye can scan for blocked or partial wires fast.
 */
import { Badge } from "@/components/ui/badge";

type Status =
  | "wired"
  | "declared-only"
  | "missing"
  | "broken"
  | "partial"
  | "not-applicable"
  | "blocked";

interface AreaCell {
  area: string;
  status: Status;
  score: number;
  required: boolean;
  missing: string[];
}

interface ModuleRow {
  moduleKey: string;
  moduleName: string;
  readinessScore: number;
  readinessStatus: string;
  areas: AreaCell[];
}

export interface WiringMatrixTableProps {
  modules: ModuleRow[];
  columns: string[];
  onModuleClick?: (moduleKey: string) => void;
}

export function WiringMatrixTable({ modules, columns, onModuleClick }: WiringMatrixTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr className="border-b">
            <th className="text-left py-2 px-3 font-medium sticky left-0 bg-muted/40">Module</th>
            <th className="text-right py-2 px-3 font-medium">Score</th>
            {columns.map((c) => (
              <th key={c} className="text-center py-2 px-2 font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((mod) => (
            <tr key={mod.moduleKey} className="border-b last:border-0 hover:bg-muted/20">
              <td className="py-2 px-3 sticky left-0 bg-background hover:bg-muted/20">
                <button
                  type="button"
                  className="text-left font-medium hover:underline"
                  onClick={() => onModuleClick?.(mod.moduleKey)}
                  data-testid={`awi-row-${mod.moduleKey}`}
                >
                  {mod.moduleName}
                  <div className="text-[10px] text-muted-foreground">{mod.moduleKey}</div>
                </button>
              </td>
              <td className="py-2 px-3 text-right tabular-nums">
                <Badge variant={readinessVariant(mod.readinessStatus)}>{mod.readinessScore}</Badge>
              </td>
              {columns.map((col) => {
                const a = mod.areas.find((x) => x.area === col);
                return (
                  <td key={col} className="py-2 px-2 text-center">
                    <StatusBadge area={a} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ area }: { area?: AreaCell }) {
  if (!area || area.status === "not-applicable") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Badge variant={statusVariant(area.status)} title={titleFor(area)}>
      {symbolFor(area.status)}
    </Badge>
  );
}

function symbolFor(status: Status): string {
  switch (status) {
    case "wired":
      return "✓";
    case "partial":
      return "◐";
    case "declared-only":
      return "○";
    case "missing":
      return "!";
    case "broken":
      return "✕";
    case "blocked":
      return "■";
    default:
      return "—";
  }
}

function statusVariant(
  status: Status,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "wired":
      return "default";
    case "partial":
      return "secondary";
    case "declared-only":
      return "outline";
    case "missing":
    case "broken":
    case "blocked":
      return "destructive";
    default:
      return "outline";
  }
}

function readinessVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "fully-wired":
      return "default";
    case "mostly-wired":
      return "secondary";
    case "partially-wired":
      return "outline";
    case "blocked":
    case "declared-only":
      return "destructive";
    default:
      return "outline";
  }
}

function titleFor(area: AreaCell): string {
  const base = `${area.area}: ${area.status} (score ${area.score})`;
  return area.missing.length ? `${base} — missing: ${area.missing.join(", ")}` : base;
}
