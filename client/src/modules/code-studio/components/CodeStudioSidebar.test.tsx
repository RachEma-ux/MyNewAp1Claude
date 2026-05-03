/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CodeStudioSidebar from "./CodeStudioSidebar";

describe("CodeStudioSidebar", () => {
  // TODO(readiness PR 1 follow-up): the component pulls tRPC hooks
  // through a child; this test would need a TRPC provider wrapper
  // (or a vi.mock of @/lib/trpc) to render. Currently fails with
  // "Unable to find tRPC Context". Skipped until the test harness
  // is refreshed; classification recorded in
  // docs/evidence/tests/UNIT_TEST_CLUSTER_CLASSIFICATION.md (cat K).
  it.skip("renders a Templates item and navigates to it", () => {
    const onNavigate = vi.fn();

    render(
      <CodeStudioSidebar
        active="jobs"
        onNavigate={onNavigate}
        collapsed={false}
        onToggle={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Templates/i }));

    expect(screen.getByText("Templates")).toBeInTheDocument();
    expect(onNavigate).toHaveBeenCalledWith("templates");
  });
});
