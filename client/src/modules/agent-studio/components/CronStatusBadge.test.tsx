// @vitest-environment jsdom
//
// CronStatusBadge — 4-state rendering tests.
//
// Locks the priority order (loading > error > healthy > never run)
// and the variant mapping so a future tweak to the badge ladder
// trips a test rather than going silent across 18 retention panels.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CronStatusBadge } from "./CronStatusBadge";

describe("CronStatusBadge", () => {
  it("renders loading when isLoading is true (even with lastError + lastRunAt set)", () => {
    render(
      <CronStatusBadge
        isLoading={true}
        lastError="ASDB unreachable"
        lastRunAt={new Date()}
      />,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/healthy/i)).not.toBeInTheDocument();
  });

  it("renders error when lastError is non-empty and not loading", () => {
    render(
      <CronStatusBadge
        isLoading={false}
        lastError="ASDB unreachable"
        lastRunAt={new Date()}
      />,
    );
    expect(screen.getByText(/error/i)).toBeInTheDocument();
    expect(screen.queryByText(/healthy/i)).not.toBeInTheDocument();
  });

  it("renders healthy when lastRunAt is set and no error", () => {
    render(
      <CronStatusBadge
        isLoading={false}
        lastError={null}
        lastRunAt={new Date("2026-05-12T18:00:00Z")}
      />,
    );
    expect(screen.getByText(/healthy/i)).toBeInTheDocument();
  });

  it("renders never run when lastRunAt is null and no error", () => {
    render(
      <CronStatusBadge
        isLoading={false}
        lastError={null}
        lastRunAt={null}
      />,
    );
    expect(screen.getByText(/never run/i)).toBeInTheDocument();
  });

  it("treats undefined lastError + undefined lastRunAt as never run", () => {
    render(
      <CronStatusBadge
        isLoading={false}
        lastError={undefined}
        lastRunAt={undefined}
      />,
    );
    expect(screen.getByText(/never run/i)).toBeInTheDocument();
  });

  it("accepts lastRunAt as a string (tRPC SuperJSON edge cases)", () => {
    // Some serialization paths return dates as ISO strings; the
    // component shouldn't care so long as the value is truthy.
    render(
      <CronStatusBadge
        isLoading={false}
        lastError={null}
        lastRunAt="2026-05-12T18:00:00.000Z"
      />,
    );
    expect(screen.getByText(/healthy/i)).toBeInTheDocument();
  });

  it("treats empty-string lastError as no error (truthy check, not just null check)", () => {
    // Defensive: if a future caller passes `""` from a getStatus
    // result, that should NOT render as error — empty string means
    // "no error message captured."
    render(
      <CronStatusBadge
        isLoading={false}
        lastError=""
        lastRunAt={new Date()}
      />,
    );
    expect(screen.getByText(/healthy/i)).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });
});
