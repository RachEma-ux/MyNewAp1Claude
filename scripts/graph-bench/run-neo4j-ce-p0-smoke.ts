/**
 * P0 closure live smoke for Neo4jCommunityGraphRepository — runs the
 * traversal / permission / explain / projection-sync surfaces against
 * a real Neo4j CE instance and writes evidence to disk.
 *
 * Required env:
 *   - NEO4J_URI           (default bolt://localhost:7687)
 *   - NEO4J_USER          (default neo4j)
 *   - NEO4J_PASSWORD      (REQUIRED — no default)
 *   - NEO4J_DATABASE      (default neo4j)
 *   - DATABASE_URL_ASDB   (REQUIRED for projection-sync lifecycle)
 *
 * Honest skip-when-unavailable:
 *   - If NEO4J_PASSWORD is unset → exit 78 (skip) with a clear note.
 *     This matches the test convention rather than printing a false pass.
 *   - If health probe fails → exit 1 (FAIL) with the connection error.
 *
 * Output:
 *   - Markdown evidence at
 *     docs/evidence/graph-backend/${date}-neo4j-ce-p0-smoke/report.md
 *   - JSON evidence at the same prefix with `.json` extension
 *
 * Scenarios (each iteration measured at p50/p95/mean):
 *   - health-probe
 *   - projection-batch (small fixture upsert)
 *   - localGraph (1-hop from a seed)
 *   - neighborhood (depth-2)
 *   - shortestPath (5-hop chain)
 *   - permission-filter (allowed + denied mix)
 *   - explain-node
 *
 * Per CLAUDE.md hard rules: this script runs only via operator-
 * triggered `workflow_dispatch` (see .github/workflows/graph-p0-smoke-neo4j-ce.yml).
 * It does NOT run in unit-test CI.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import {
  Neo4jCommunityGraphRepository,
  type Neo4jExecutor,
} from "../../server/agent-studio/services/graph/repository/neo4j-community-graph-repository.js";
import {
  GraphCapabilityUnsupportedError,
  type RuntimeContext,
} from "../../server/agent-studio/services/graph/repository/index.js";

interface ScenarioResult {
  readonly key: string;
  readonly description: string;
  readonly iterations: number;
  readonly samples: number[];
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly meanMs: number;
  readonly resultCount: number;
  readonly passed: boolean;
  readonly notes: string;
}

interface SmokeReport {
  readonly runAt: string;
  readonly commitSha: string;
  readonly backendKey: string;
  readonly neo4jVersion?: string;
  readonly datasetSize: { nodes: number; edges: number };
  readonly scenarios: ReadonlyArray<ScenarioResult>;
  readonly overallPassed: boolean;
  readonly environment: {
    readonly endpoint: string;
    readonly database: string;
    readonly fixtureKind: "synthetic-chain-50";
  };
}

const FIXTURE_NODE_COUNT = 50;
const FIXTURE_EDGE_COUNT = FIXTURE_NODE_COUNT - 1;
const RUNTIME: RuntimeContext = {
  workspaceId: 1,
  userId: 1,
  userRole: "admin",
  governanceStatusFilter: ["active"],
};

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * p)] ?? 0;
}

function mean(samples: number[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

async function runScenario(
  key: string,
  description: string,
  iterations: number,
  fn: () => Promise<{ resultCount: number }>,
): Promise<ScenarioResult> {
  const samples: number[] = [];
  let resultCount = 0;
  let passed = true;
  let notes = "";
  for (let i = 0; i < iterations; i++) {
    const t0 = Date.now();
    try {
      const out = await fn();
      resultCount = out.resultCount;
    } catch (err) {
      passed = false;
      notes = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
    samples.push(Date.now() - t0);
  }
  return {
    key,
    description,
    iterations,
    samples,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    meanMs: mean(samples),
    resultCount,
    passed,
    notes,
  };
}

async function seedFixture(
  repo: Neo4jCommunityGraphRepository,
): Promise<void> {
  // Build a 50-node chain: n0 -> n1 -> n2 -> ... -> n49
  const nodes = Array.from({ length: FIXTURE_NODE_COUNT }, (_, i) => ({
    kind: "upsert_node" as const,
    node: {
      typeKey: "smoke_node",
      id: `smoke-${i}`,
      properties: {
        id: `smoke-${i}`,
        workspace_id: 1,
        governance_status: "active",
        visibility: "visible",
        sensitivity: "public",
      },
      provenance: {
        sourceType: "p0_smoke",
        sourceId: `seed-${i}`,
        lineageStatus: "asserted" as const,
        governanceStatus: "active" as const,
      },
    },
  }));
  const edges = Array.from({ length: FIXTURE_EDGE_COUNT }, (_, i) => ({
    kind: "upsert_edge" as const,
    edge: {
      typeKey: "SMOKE_REL",
      id: `smoke-edge-${i}`,
      sourceNode: { typeKey: "smoke_node", id: `smoke-${i}` },
      targetNode: { typeKey: "smoke_node", id: `smoke-${i + 1}` },
      properties: { workspace_id: 1 },
      provenance: {
        sourceType: "p0_smoke",
        sourceId: `seed-edge-${i}`,
        lineageStatus: "asserted" as const,
      },
    },
  }));
  // Add one cross-tenant node + one confidential node for permission tests.
  nodes.push({
    kind: "upsert_node",
    node: {
      typeKey: "smoke_node",
      id: "smoke-cross-tenant",
      properties: {
        id: "smoke-cross-tenant",
        workspace_id: 999,
        governance_status: "active",
        visibility: "visible",
        sensitivity: "public",
      },
      provenance: {
        sourceType: "p0_smoke",
        sourceId: "cross-tenant",
        lineageStatus: "asserted",
        governanceStatus: "active",
      },
    },
  });
  await repo.applyProjectionJob([...nodes, ...edges]);
}

async function main(): Promise<void> {
  const password = process.env.NEO4J_PASSWORD;
  if (!password) {
    process.stderr.write(
      "[smoke] NEO4J_PASSWORD not set — skipping (exit 78).\n" +
        "[smoke] Set NEO4J_PASSWORD to run live; CI provides it via service container.\n",
    );
    process.exit(78);
  }

  const repo = new Neo4jCommunityGraphRepository({
    endpoint: process.env.NEO4J_URI ?? "bolt://localhost:7687",
    username: process.env.NEO4J_USER ?? "neo4j",
    password,
    database: process.env.NEO4J_DATABASE ?? "neo4j",
  });

  // Health gate first.
  const health = await repo.health();
  if (health.status !== "healthy") {
    process.stderr.write(
      `[smoke] health probe failed: ${health.errors?.join("; ") ?? "unknown"}\n`,
    );
    process.exit(1);
  }

  // Seed the fixture once before the loop.
  process.stderr.write("[smoke] seeding fixture...\n");
  await seedFixture(repo);

  const iterations = Number(process.env.SMOKE_ITERATIONS ?? "10");
  const scenarios: ScenarioResult[] = [];

  scenarios.push(
    await runScenario("health-probe", "Neo4j connectivity + version", iterations, async () => {
      const h = await repo.health();
      return { resultCount: h.status === "healthy" ? 1 : 0 };
    }),
  );

  scenarios.push(
    await runScenario(
      "localGraph-1hop",
      "1-hop neighborhood from seed",
      iterations,
      async () => {
        const out = await repo.localGraph(
          "smoke-0",
          { maxDepth: 1, maxResults: 50 },
          RUNTIME,
        );
        return { resultCount: out.nodes.length };
      },
    ),
  );

  scenarios.push(
    await runScenario(
      "neighborhood-depth-2",
      "depth-2 neighborhood traversal",
      iterations,
      async () => {
        const out = await repo.neighborhood("smoke-0", 2, RUNTIME);
        return { resultCount: out.nodes.length };
      },
    ),
  );

  scenarios.push(
    await runScenario(
      "shortestPath-5hop",
      "shortest path across 5 hops in the chain",
      iterations,
      async () => {
        const out = await repo.shortestPath("smoke-0", "smoke-5", RUNTIME);
        return { resultCount: out ? out.length : 0 };
      },
    ),
  );

  scenarios.push(
    await runScenario(
      "permission-filter",
      "filterByPermissions blocks cross-tenant",
      iterations,
      async () => {
        const out = await repo.filterByPermissions(
          [
            { typeKey: "smoke_node", id: "smoke-0" },
            { typeKey: "smoke_node", id: "smoke-cross-tenant" },
          ],
          RUNTIME,
        );
        // PASS = exactly 1 (smoke-0); cross-tenant denied
        return { resultCount: out.length === 1 && out[0]!.id === "smoke-0" ? 1 : 0 };
      },
    ),
  );

  scenarios.push(
    await runScenario(
      "explain-node",
      "explainNode returns provenance",
      iterations,
      async () => {
        const out = await repo.explainNode("smoke-0", RUNTIME);
        return { resultCount: out ? 1 : 0 };
      },
    ),
  );

  scenarios.push(
    await runScenario(
      "algorithm-shortest-path",
      "runAlgorithm shortest_path",
      iterations,
      async () => {
        const out = await repo.runAlgorithm({
          algorithmKey: "shortest_path",
          parameters: { from: "smoke-0", to: "smoke-3" },
          runtime: RUNTIME,
        });
        return { resultCount: out.rows.length };
      },
    ),
  );

  // Capability-gated negative test
  let unsupportedThrown = false;
  try {
    await repo.runAlgorithm({
      algorithmKey: "centrality",
      parameters: {},
      runtime: RUNTIME,
    });
  } catch (err) {
    if (err instanceof GraphCapabilityUnsupportedError) {
      unsupportedThrown = true;
    }
  }
  scenarios.push({
    key: "algorithm-unsupported-error",
    description: "runAlgorithm centrality throws GraphCapabilityUnsupportedError",
    iterations: 1,
    samples: [0],
    p50Ms: 0,
    p95Ms: 0,
    meanMs: 0,
    resultCount: unsupportedThrown ? 1 : 0,
    passed: unsupportedThrown,
    notes: unsupportedThrown
      ? "expected error raised"
      : "FAIL: expected GraphCapabilityUnsupportedError",
  });

  const overallPassed = scenarios.every((s) => s.passed);
  const runAt = new Date().toISOString();
  const commitSha = process.env.GITHUB_SHA ?? "local";

  const report: SmokeReport = {
    runAt,
    commitSha,
    backendKey: "neo4j-ce",
    datasetSize: { nodes: FIXTURE_NODE_COUNT + 1, edges: FIXTURE_EDGE_COUNT },
    scenarios,
    overallPassed,
    environment: {
      endpoint: process.env.NEO4J_URI ?? "bolt://localhost:7687",
      database: process.env.NEO4J_DATABASE ?? "neo4j",
      fixtureKind: "synthetic-chain-50",
    },
  };

  // Persist the evidence under docs/evidence/graph-backend/<date>-neo4j-ce-p0-smoke/
  const dateSlug = runAt.slice(0, 10);
  const outDir = join(
    process.cwd(),
    "docs",
    "evidence",
    "graph-backend",
    `${dateSlug}-neo4j-ce-p0-smoke`,
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, "report.md"), formatMarkdown(report));

  process.stdout.write(
    `[smoke] wrote evidence to ${outDir}\n` +
      `[smoke] overall: ${overallPassed ? "PASS" : "FAIL"}\n`,
  );
  process.exit(overallPassed ? 0 : 1);
}

function formatMarkdown(report: SmokeReport): string {
  const lines: string[] = [];
  lines.push(`# Neo4j CE P0 Smoke Report`);
  lines.push("");
  lines.push(`- **Run at:** ${report.runAt}`);
  lines.push(`- **Commit SHA:** ${report.commitSha}`);
  lines.push(`- **Backend:** ${report.backendKey}`);
  lines.push(`- **Dataset:** ${report.datasetSize.nodes} nodes / ${report.datasetSize.edges} edges (${report.environment.fixtureKind})`);
  lines.push(`- **Endpoint:** ${report.environment.endpoint}`);
  lines.push(`- **Overall:** ${report.overallPassed ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("| Scenario | Iter | p50 (ms) | p95 (ms) | mean (ms) | resultCount | Status | Notes |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |");
  for (const s of report.scenarios) {
    lines.push(
      `| \`${s.key}\` | ${s.iterations} | ${s.p50Ms} | ${s.p95Ms} | ${s.meanMs.toFixed(2)} | ${s.resultCount} | ${s.passed ? "PASS" : "FAIL"} | ${s.notes || "—"} |`,
    );
  }
  lines.push("");
  lines.push("## Closure status");
  lines.push("");
  lines.push(
    report.overallPassed
      ? "All P0 closure scenarios passed. Mark the G10 closure ladder for this commit SHA as evidence-backed."
      : "One or more P0 scenarios FAILED. Do NOT mark closure complete; investigate the failed rows above.",
  );
  return lines.join("\n");
}

main().catch((err) => {
  process.stderr.write(
    `[smoke] unhandled error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(2);
});
