/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import CodeStudioSidebar from "./CodeStudioSidebar";

describe("CodeStudioSidebar", () => {
  it("renders a Templates item and navigates to it", () => {
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
