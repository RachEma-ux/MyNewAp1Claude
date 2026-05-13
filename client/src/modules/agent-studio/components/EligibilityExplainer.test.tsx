/**
 * @vitest-environment jsdom
 *
 * EligibilityExplainer component tests — operator-facing retention
 * explainer shipped at PR #702 and extracted to its own component file
 * at PR #708.
 *
 * Covers each rendering branch against a mocked
 * `agentStudio.publish.explainRetentionEligibility` tRPC query:
 *
 *   - Loading state — "Loading retention eligibility…" line.
 *   - Error state — amber "Eligibility lookup failed: …" line.
 *   - Eligible state (no blockers) — emerald "No active blockers —
 *     the next sweep will delete this row." affirmation and an
 *     "eligible" badge.
 *   - Preserved state (blockers present) — amber panel listing each
 *     blocker code and a "preserved" badge.
 *   - Null timestamps — `terminalAt` and `retentionEligibleAt` render
 *     as "—" instead of formatted ISO strings.
 *
 * The default 90-day window is verified flowing into the query input.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { EligibilityExplainer } from "./EligibilityExplainer";

interface ExplainerData {
  retentionEligible: boolean;
  state: string;
  terminalAt: string | Date | null;
  retentionEligibleAt: string | Date | null;
  retentionBlockers: ReadonlyArray<string>;
}

const mocks = vi.hoisted(() => ({
  lastQueryInput: undefined as unknown,
  state: {
    isLoading: false,
    error: null as { message: string } | null,
    data: undefined as ExplainerData | undefined,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agentStudio: {
      publish: {
        explainRetentionEligibility: {
          useQuery: (input: unknown) => {
            mocks.lastQueryInput = input;
            return mocks.state;
          },
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.lastQueryInput = undefined;
  mocks.state.isLoading = false;
  mocks.state.error = null;
  mocks.state.data = undefined;
});

describe("EligibilityExplainer — PR #702 / extracted at #708", () => {
  it("renders the loading state while the query is fetching", () => {
    mocks.state.isLoading = true;
    render(<EligibilityExplainer entityType="ags_publish_requests" entityId={42} />);
    expect(
      screen.getByText(/loading retention eligibility/i),
    ).toBeInTheDocument();
  });

  it("renders the error state with the surfaced message", () => {
    mocks.state.error = { message: "ASDB unreachable" };
    render(<EligibilityExplainer entityType="ags_publish_requests" entityId={42} />);
    expect(
      screen.getByText(/eligibility lookup failed.*ASDB unreachable/i),
    ).toBeInTheDocument();
  });

  it("renders the eligible state with the affirmation line when there are no blockers", () => {
    mocks.state.data = {
      retentionEligible: true,
      state: "approved",
      terminalAt: new Date("2026-01-01T00:00:00Z"),
      retentionEligibleAt: new Date("2026-04-01T00:00:00Z"),
      retentionBlockers: [],
    };
    render(<EligibilityExplainer entityType="ags_publish_requests" entityId={42} />);
    expect(screen.getByText(/eligible$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no active blockers — the next sweep will delete this row/i),
    ).toBeInTheDocument();
    // ISO timestamps surface for operator triage
    expect(screen.getByText("2026-01-01T00:00:00.000Z")).toBeInTheDocument();
    expect(screen.getByText("2026-04-01T00:00:00.000Z")).toBeInTheDocument();
  });

  it("renders the preserved state and lists each blocker code", () => {
    mocks.state.data = {
      retentionEligible: false,
      state: "approved",
      terminalAt: new Date("2026-01-01T00:00:00Z"),
      retentionEligibleAt: null,
      retentionBlockers: ["LEGAL_HOLD", "ACTIVE_RELEASE_LINK"],
    };
    render(<EligibilityExplainer entityType="ags_publish_requests" entityId={42} />);
    expect(screen.getByText(/preserved/i)).toBeInTheDocument();
    expect(screen.getByText("LEGAL_HOLD")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE_RELEASE_LINK")).toBeInTheDocument();
    // The "no blockers" affirmation must NOT appear in this branch
    expect(
      screen.queryByText(/no active blockers/i),
    ).not.toBeInTheDocument();
  });

  it("renders '—' for null terminalAt / retentionEligibleAt", () => {
    mocks.state.data = {
      retentionEligible: false,
      state: "pending",
      terminalAt: null,
      retentionEligibleAt: null,
      retentionBlockers: ["NON_TERMINAL_STATE"],
    };
    render(<EligibilityExplainer entityType="ags_publish_requests" entityId={42} />);
    const dashes = screen.getAllByText("—");
    // terminalAt + retentionEligibleAt = 2 dashes
    expect(dashes.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("NON_TERMINAL_STATE")).toBeInTheDocument();
  });

  it("passes the 90-day default window into the query input", () => {
    mocks.state.data = {
      retentionEligible: true,
      state: "approved",
      terminalAt: null,
      retentionEligibleAt: null,
      retentionBlockers: [],
    };
    render(<EligibilityExplainer entityType="ags_approval_steps" entityId={99} />);
    const input = mocks.lastQueryInput as {
      entityType?: string;
      entityId?: number;
      retentionDays?: number;
    };
    expect(input.entityType).toBe("ags_approval_steps");
    expect(input.entityId).toBe(99);
    expect(input.retentionDays).toBe(90);
  });

  it("returns null when query is settled but data is undefined", () => {
    // settled = !isLoading && !error; data still undefined defensive branch
    mocks.state.data = undefined;
    const { container } = render(
      <EligibilityExplainer entityType="ags_publish_requests" entityId={42} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
