/**
 * T-G.1.ζ — Institutional Memory Lens: sixth projector-backed node
 * type (`inst_timeline_event`) wired through the lens runner.
 *
 * Replication of the α-shell pattern with one important variation:
 * timeline_event id is `timeline_event:<sourceKind>:<rawId>` because
 * the source-mapping says the lens-runner unions multiple tables
 * (runtime_run / approval_step / vault_version / governance_record).
 * Without the sourceKind discriminator, raw numeric ids would collide
 * across source tables.
 *
 * Acceptance shape:
 *   1. Legacy runner shape preserved when `timelineEvents` is undefined or [].
 *   2. When supplied, emits one `inst_timeline_event` per row with
 *      stable id `timeline_event:<sourceKind>:<id>` + label + meta.
 *   3. Permission gate applies uniformly to inst_timeline_event.
 *   4. typeKey aligns with closed taxonomy entry `timeline_event`
 *      mapped to `ags_runtime_runs` per source-mapping (primary).
 *   5. sourceKind discriminator allows multiple raw-id-900 events to
 *      coexist across source tables (proves union-safety).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  buildInstitutionalMemoryLensSnapshot,
  type GraphLensDefinition,
  type InstitutionalMemoryLensAgentRow,
  type InstitutionalMemoryLensReadResult,
  type InstitutionalMemoryLensTimelineEventRow,
  type LensRunnerViewerContext,
} from "../../server/agent-studio/services/graph-lens/public-api";

import {
  INSTITUTIONAL_MEMORY_NODE_TYPES,
  INSTITUTIONAL_MEMORY_SOURCE_MAPPING,
} from "../../server/agent-studio/services/institutional-memory/public-api";

const NOW = new Date("2026-05-17T22:00:00Z");
const T = new Date("2026-05-17T00:00:00Z");

const VIEWER: LensRunnerViewerContext = { workspaceId: 1, userId: 42 };
const VIEWER_ANON: LensRunnerViewerContext = { workspaceId: 1, userId: null };

function makeDef(): GraphLensDefinition {
  return {
    id: "inst_test_zeta",
    kind: "institutional_memory",
    label: "Institutional Memory",
    layout: "timeline",
    governanceScope: "workspace_members",
  };
}

function makeAgent(
  overrides: Partial<InstitutionalMemoryLensAgentRow> = {},
): InstitutionalMemoryLensAgentRow {
  return {
    id: 1,
    name: "agent-one",
    internalKey: "agent_one",
    ownerId: 11,
    domain: "ops",
    visibility: "workspace",
    lifecycleState: "active",
    agentClass: "primary",
    createdAt: T,
    ...overrides,
  };
}

function makeTimelineEvent(
  overrides: Partial<InstitutionalMemoryLensTimelineEventRow> = {},
): InstitutionalMemoryLensTimelineEventRow {
  return {
    id: 9000,
    sourceKind: "runtime_run",
    occurredAt: T,
    label: "runtime run 9000 succeeded",
    meta: { agentKey: "agent_one", status: "succeeded" },
    ...overrides,
  };
}

describe("T-G.1.ζ — InstitutionalMemoryLens emits inst_timeline_event nodes", () => {
  it("legacy runner shape preserved when timelineEvents is undefined", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent()],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const typeKeys = new Set(snap.nodes.map((n) => n.typeKey));
    expect(typeKeys.has("inst_timeline_event")).toBe(false);
  });

  it("legacy shape preserved when timelineEvents is empty array", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent()],
      timelineEvents: [],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    expect(
      snap.nodes.find((n) => n.typeKey === "inst_timeline_event"),
    ).toBeUndefined();
  });

  it("emits one inst_timeline_event per row with id encoded as sourceKind:id", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [],
      timelineEvents: [
        makeTimelineEvent({
          id: 9000,
          sourceKind: "runtime_run",
          label: "run 9000 succeeded",
        }),
        makeTimelineEvent({
          id: 200,
          sourceKind: "approval_step",
          label: "approval step 200 approved",
          meta: { state: "approved" },
        }),
      ],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const events = snap.nodes.filter((n) => n.typeKey === "inst_timeline_event");
    expect(events.length).toBe(2);
    expect(events[0]!.id).toBe("timeline_event:runtime_run:9000");
    expect(events[0]!.label).toBe("run 9000 succeeded");
    expect(events[0]!.meta).toMatchObject({
      eventId: 9000,
      sourceKind: "runtime_run",
      occurredAt: T.toISOString(),
      agentKey: "agent_one",
      status: "succeeded",
    });
    expect(events[1]!.id).toBe("timeline_event:approval_step:200");
    expect(events[1]!.meta).toMatchObject({
      eventId: 200,
      sourceKind: "approval_step",
      state: "approved",
    });
  });

  it("union-safe: same raw id 900 across all 4 sourceKinds yields 4 distinct node ids", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [],
      timelineEvents: [
        makeTimelineEvent({ id: 900, sourceKind: "runtime_run" }),
        makeTimelineEvent({ id: 900, sourceKind: "approval_step" }),
        makeTimelineEvent({ id: 900, sourceKind: "vault_version" }),
        makeTimelineEvent({ id: 900, sourceKind: "governance_record" }),
      ],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const ids = new Set(
      snap.nodes
        .filter((n) => n.typeKey === "inst_timeline_event")
        .map((n) => n.id),
    );
    expect(ids).toEqual(
      new Set([
        "timeline_event:runtime_run:900",
        "timeline_event:approval_step:900",
        "timeline_event:vault_version:900",
        "timeline_event:governance_record:900",
      ]),
    );
  });

  it("null meta on a row produces just the runner-provided meta fields", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [],
      timelineEvents: [
        makeTimelineEvent({ id: 9100, meta: null }),
      ],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const ev = snap.nodes.find((n) => n.typeKey === "inst_timeline_event")!;
    expect(ev.meta).toMatchObject({
      eventId: 9100,
      sourceKind: "runtime_run",
      occurredAt: T.toISOString(),
    });
  });

  it("anonymous viewer gets visible:false inst_timeline_event contributing to hiddenNodeCount", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 1, ownerId: 11, domain: "ops" })],
      timelineEvents: [
        makeTimelineEvent({ id: 9000 }),
        makeTimelineEvent({ id: 9001 }),
      ],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read,
      now: NOW,
    });
    const events = snap.nodes.filter((n) => n.typeKey === "inst_timeline_event");
    expect(events.length).toBe(2);
    for (const n of events) {
      expect(n.visible).toBe(false);
      expect(n.label).toBeUndefined();
      expect(n.meta).toBeUndefined();
    }
    // 1 inst_owner + 1 inst_domain + 1 inst_agent + 2 inst_timeline_event = 5 hidden
    expect(snap.hiddenNodeCount).toBe(5);
  });

  it("typeKey `inst_timeline_event` aligns with closed taxonomy + primary source mapping", () => {
    expect((INSTITUTIONAL_MEMORY_NODE_TYPES as readonly string[])).toContain(
      "timeline_event",
    );
    expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.timeline_event.sourceTable).toBe(
      "ags_runtime_runs",
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Source-scan integrity — protects against silent rename drift
// ──────────────────────────────────────────────────────────────────

describe("T-G.1.ζ source-scan integrity", () => {
  it("runner file names the new typeKey, prefix, and read shape", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/institutional-memory-lens-runner.ts",
      ),
      "utf-8",
    );
    expect(file).toContain('"inst_timeline_event"');
    expect(file).toContain('"timeline_event:"');
    expect(file).toContain("InstitutionalMemoryLensTimelineEventRow");
    expect(file).toContain("timelineEvents?:");
  });
});
