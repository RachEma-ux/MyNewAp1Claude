/**
 * Staging Runtime — Health Check
 *
 * Probes every staging service whose URL env var is set, reports
 * structured status, and never prints secret values.
 *
 *   pnpm run staging:health         # human output, exit 0 on all healthy
 *   pnpm run staging:health --json  # JSON output
 *
 * Exit codes:
 *   0 — every probed URL responded healthy
 *   1 — at least one probed URL is reachable but unhealthy
 *   2 — at least one probed URL env is missing (a partial deploy)
 *
 * The probes are the same set as the preflight uses; importing the
 * preflight's probeAllUrls would create a circular shape concern, so
 * this file owns its own thin probe loop.
 */

interface HealthProbe {
  key: string;
  url: string | null;
  status: "missing-env" | "reachable" | "unhealthy" | "unreachable";
  httpStatus?: number;
  payload?: unknown;
  error?: string;
}

const TARGETS: { key: string; path: string }[] = [
  { key: "STAGING_APP_URL", path: "/api/health" },
  { key: "OPA_URL", path: "/health" },
  { key: "GRAPHRAG_WORKER_URL", path: "/health" },
  { key: "DATA_ACQUISITION_WORKER_URL", path: "/health" },
  { key: "EXTERNAL_ORCHESTRATOR_URL", path: "/health" },
  { key: "SANDBOX_WF_WORKER_URL", path: "/health" },
  { key: "KGRA_SERVICE_URL", path: "/health" },
];

async function probe(target: { key: string; path: string }): Promise<HealthProbe> {
  const base = process.env[target.key];
  if (!base || base.length === 0) {
    return { key: target.key, url: null, status: "missing-env" };
  }
  const url = `${base.replace(/\/$/, "")}${target.path}`;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(timer);
    const text = await res.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // not JSON; keep as text
    }
    if (res.ok) return { key: target.key, url, status: "reachable", httpStatus: res.status, payload };
    return { key: target.key, url, status: "unhealthy", httpStatus: res.status, payload };
  } catch (err) {
    return {
      key: target.key,
      url,
      status: "unreachable",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function formatHuman(probes: HealthProbe[]): string {
  const lines: string[] = ["Staging health probes:"];
  for (const p of probes) {
    const tag =
      p.status === "reachable"
        ? "[ok]"
        : p.status === "missing-env"
          ? "[..]"
          : p.status === "unhealthy"
            ? "[!!]"
            : "[--]";
    const extra = p.httpStatus
      ? ` HTTP ${p.httpStatus}`
      : p.error
        ? ` (${p.error})`
        : "";
    lines.push(`  ${tag} ${p.key}: ${p.status}${extra}`);
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const probes = await Promise.all(TARGETS.map(probe));

  if (json) {
    process.stdout.write(JSON.stringify(probes, null, 2) + "\n");
  } else {
    process.stdout.write(formatHuman(probes) + "\n");
  }

  const anyUnhealthy = probes.some((p) => p.status === "unhealthy" || p.status === "unreachable");
  const anyMissingEnv = probes.some((p) => p.status === "missing-env");

  if (anyUnhealthy) process.exit(1);
  if (anyMissingEnv) process.exit(2);
  process.exit(0);
}

const isMain =
  typeof require !== "undefined" && require.main === module
    ? true
    : import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  void main();
}

export { probe, formatHuman };
export type { HealthProbe };
