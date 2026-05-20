/**
 * Source-scan integrity test for the runtime + decision trace
 * graph-visualization view.
 *
 * Closes the items 23 / 24 partial-gap from PR #1397's classification
 * ("list-view exists, graph-visual pending"). RuntimeAndDecisionTraceView
 * now has a `graph` / `list` view-mode toggle and renders a radial
 * SVG node-link diagram (TraceGraphView) when the mode is "graph".
 *
 * Guards against regressions where:
 *   - The toggle disappears or loses its test id
 *   - TraceGraphView stops being mounted in graph mode
 *   - The list-mode rendering loses its JSON-row layout
 *   - The trace template wiring (impact_runtime / impact_governance)
 *     gets severed
 *   - The barrel export for TraceGraphView gets dropped
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("Runtime + decision trace graph viz", () => {
  const viewSrc = read(
    "client/src/modules/agent-studio/components/graph-workspace/RuntimeAndDecisionTraceView.tsx",
  );
  const graphSrc = read(
    "client/src/modules/agent-studio/components/graph-workspace/TraceGraphView.tsx",
  );
  const barrelSrc = read(
    "client/src/modules/agent-studio/components/graph-workspace/index.ts",
  );

  describe("view-mode toggle", () => {
    it("declares VIEW_MODES = ['graph', 'list']", () => {
      expect(/const\s+VIEW_MODES\s*=\s*\["graph",\s*"list"\]\s*as\s+const/.test(viewSrc)).toBe(
        true,
      );
    });

    it("declares a TraceViewMode union type", () => {
      expect(/type\s+TraceViewMode\s*=\s*\(typeof\s+VIEW_MODES\)\[number\]/.test(viewSrc)).toBe(
        true,
      );
    });

    it("renders a `trace-view-mode-toggle` container with per-mode buttons", () => {
      expect(/data-testid="trace-view-mode-toggle"/.test(viewSrc)).toBe(true);
      expect(/data-testid=\{`trace-view-mode-\$\{mode\}`\}/.test(viewSrc)).toBe(true);
    });

    it("defaults to `graph` mode (visual-first per item 23/24 closure)", () => {
      expect(
        /useState<TraceViewMode>\("graph"\)/.test(viewSrc),
      ).toBe(true);
    });

    it("marks the active button with `data-active`", () => {
      expect(
        /data-active=\{mode\s*===\s*viewMode\s*\?\s*"true"\s*:\s*"false"\}/.test(viewSrc),
      ).toBe(true);
    });

    it("clicking a mode button routes through setViewMode", () => {
      expect(/onClick=\{\(\)\s*=>\s*setViewMode\(mode\)\}/.test(viewSrc)).toBe(true);
    });
  });

  describe("conditional rendering", () => {
    it("graph mode mounts <TraceGraphView>", () => {
      expect(
        /viewMode\s*===\s*"graph"[\s\S]+?<TraceGraphView/.test(viewSrc),
      ).toBe(true);
    });

    it("list mode preserves the JSON-row <ul> layout (back-compat)", () => {
      expect(
        /testIdPrefix\}-step-\$\{idx\}/.test(viewSrc),
      ).toBe(true);
      expect(/JSON\.stringify\(row\)/.test(viewSrc)).toBe(true);
    });

    it("propagates viewMode through to both TraceTemplate instances", () => {
      expect(
        /<TraceTemplate[\s\S]+?testIdPrefix="runtime-trace"[\s\S]+?viewMode=\{viewMode\}/.test(
          viewSrc,
        ),
      ).toBe(true);
      expect(
        /<TraceTemplate[\s\S]+?testIdPrefix="decision-trace"[\s\S]+?viewMode=\{viewMode\}/.test(
          viewSrc,
        ),
      ).toBe(true);
    });

    it("section element carries `data-view-mode` for harness inspection", () => {
      expect(/data-view-mode=\{viewMode\}/.test(viewSrc)).toBe(true);
    });
  });

  describe("preserved template wiring (impact_runtime + impact_governance)", () => {
    it("runtime trace still uses templateKey='impact_runtime'", () => {
      expect(/templateKey="impact_runtime"/.test(viewSrc)).toBe(true);
    });

    it("decision trace still uses templateKey='impact_governance'", () => {
      expect(/templateKey="impact_governance"/.test(viewSrc)).toBe(true);
    });

    it("runImpactTemplate query is still gated on a non-empty runtime_run_id", () => {
      expect(
        /runImpactTemplate\.useQuery\([\s\S]+?enabled:\s*runtimeRunId\.length\s*>\s*0/.test(
          viewSrc,
        ),
      ).toBe(true);
    });
  });

  describe("TraceGraphView component", () => {
    it("exports a default React component", () => {
      expect(/export\s+default\s+function\s+TraceGraphView\(/.test(graphSrc)).toBe(
        true,
      );
    });

    it("declares props with seedId, rows, testIdPrefix", () => {
      expect(/readonly\s+seedId:\s*string/.test(graphSrc)).toBe(true);
      expect(/readonly\s+rows:\s*ReadonlyArray<Record<string,\s*unknown>>/.test(graphSrc)).toBe(
        true,
      );
      expect(/readonly\s+testIdPrefix:\s*string/.test(graphSrc)).toBe(true);
    });

    it("dedupes impacted nodes by id (handles RETURN DISTINCT spillover)", () => {
      expect(/seen\.has\(node\.id\)/.test(graphSrc)).toBe(true);
      expect(/seen\.add\(node\.id\)/.test(graphSrc)).toBe(true);
    });

    it("renders an SVG element scoped by testIdPrefix", () => {
      expect(/data-testid=\{`\$\{testIdPrefix\}-graph`\}/.test(graphSrc)).toBe(true);
      expect(/<svg[\s\S]+?role="img"/.test(graphSrc)).toBe(true);
    });

    it("emits one <line> edge + <g> satellite per impacted node, plus a seed group", () => {
      expect(/data-testid=\{`\$\{testIdPrefix\}-graph-edge-\$\{i\}`\}/.test(graphSrc)).toBe(
        true,
      );
      expect(/data-testid=\{`\$\{testIdPrefix\}-graph-node-\$\{i\}`\}/.test(graphSrc)).toBe(
        true,
      );
      expect(/data-testid=\{`\$\{testIdPrefix\}-graph-seed`\}/.test(graphSrc)).toBe(true);
    });

    it("lays satellites radially around the seed via cos/sin", () => {
      expect(/Math\.cos\(theta\)/.test(graphSrc)).toBe(true);
      expect(/Math\.sin\(theta\)/.test(graphSrc)).toBe(true);
      expect(/i\s*\/\s*Math\.max\(total,\s*1\)/.test(graphSrc)).toBe(true);
    });

    it("emits `data-impacted-count` for snapshot-style harnesses", () => {
      expect(/data-impacted-count=\{total\}/.test(graphSrc)).toBe(true);
    });

    it("uses zero new runtime deps (pure SVG; no react-flow / d3 imports)", () => {
      expect(/from\s+["']reactflow["']/.test(graphSrc)).toBe(false);
      expect(/from\s+["']d3/.test(graphSrc)).toBe(false);
    });

    it("extractImpactedNode falls back to a stable key when row shape is unknown", () => {
      expect(/fallbackKey:\s*string/.test(graphSrc)).toBe(true);
      expect(/`row-\$\{idx\}`/.test(graphSrc)).toBe(true);
    });
  });

  describe("barrel export", () => {
    it("TraceGraphView is exported from the graph-workspace barrel", () => {
      expect(/export\s+\{\s*default\s+as\s+TraceGraphView\s*\}\s+from\s+["']\.\/TraceGraphView["']/.test(barrelSrc)).toBe(
        true,
      );
    });
  });
});
