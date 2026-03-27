/**
 * ScrollableTabsList — Component Tests
 *
 * Verifies structural invariants, accessibility attributes,
 * and class composition of the scrollable tab rail.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScrollableTabsList } from "./scrollable-tabs-list";
import { Tabs, TabsTrigger } from "./tabs";

function renderWithTabs(children: React.ReactNode) {
  return render(
    <Tabs defaultValue="a">
      {children}
    </Tabs>,
  );
}

describe("ScrollableTabsList", () => {
  it("renders TabsList with correct scroll classes", () => {
    renderWithTabs(
      <ScrollableTabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
        <TabsTrigger value="b">Tab B</TabsTrigger>
      </ScrollableTabsList>,
    );
    const list = document.querySelector('[data-slot="tabs-list"]');
    expect(list).toBeTruthy();
    expect(list!.className).toContain("overflow-x-auto");
    expect(list!.className).toContain("scrollbar-hide");
  });

  it("renders trailing spacer with aria-hidden", () => {
    renderWithTabs(
      <ScrollableTabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
      </ScrollableTabsList>,
    );
    const list = document.querySelector('[data-slot="tabs-list"]');
    const spacer = list!.querySelector('span[aria-hidden="true"]');
    expect(spacer).toBeTruthy();
    expect(spacer!.className).toContain("shrink-0");
  });

  it("renders left and right fade overlays with aria-hidden", () => {
    renderWithTabs(
      <ScrollableTabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
      </ScrollableTabsList>,
    );
    const wrapper = document.querySelector(".relative.min-w-0");
    expect(wrapper).toBeTruthy();
    // Two gradient overlays (left + right) with aria-hidden
    const fades = wrapper!.querySelectorAll(':scope > div[aria-hidden="true"]');
    expect(fades.length).toBe(2);
  });

  it("wraps in a relative container with min-w-0", () => {
    renderWithTabs(
      <ScrollableTabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
      </ScrollableTabsList>,
    );
    const wrapper = document.querySelector('[data-slot="tabs-list"]')!.parentElement;
    expect(wrapper!.className).toContain("relative");
    expect(wrapper!.className).toContain("min-w-0");
  });

  it("preserves TabsList bg-muted and rounded-lg from base", () => {
    renderWithTabs(
      <ScrollableTabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
      </ScrollableTabsList>,
    );
    const list = document.querySelector('[data-slot="tabs-list"]');
    expect(list!.className).toContain("bg-muted");
    expect(list!.className).toContain("rounded-lg");
  });

  it("renders triggers as tabbable elements", () => {
    renderWithTabs(
      <ScrollableTabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
        <TabsTrigger value="b">Tab B</TabsTrigger>
        <TabsTrigger value="c">Tab C</TabsTrigger>
      </ScrollableTabsList>,
    );
    expect(screen.getByText("Tab A")).toBeTruthy();
    expect(screen.getByText("Tab B")).toBeTruthy();
    expect(screen.getByText("Tab C")).toBeTruthy();
    // Verify they are buttons (Radix renders TabsTrigger as button)
    const buttons = screen.getAllByRole("tab");
    expect(buttons.length).toBe(3);
  });

  it("accepts and merges custom className", () => {
    renderWithTabs(
      <ScrollableTabsList className="custom-class">
        <TabsTrigger value="a">Tab A</TabsTrigger>
      </ScrollableTabsList>,
    );
    const list = document.querySelector('[data-slot="tabs-list"]');
    expect(list!.className).toContain("custom-class");
    expect(list!.className).toContain("overflow-x-auto");
  });

  it("fade overlays use pointer-events-none", () => {
    renderWithTabs(
      <ScrollableTabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
      </ScrollableTabsList>,
    );
    const wrapper = document.querySelector(".relative.min-w-0");
    const fades = wrapper!.querySelectorAll(':scope > div[aria-hidden="true"]');
    fades.forEach((fade) => {
      expect(fade.className).toContain("pointer-events-none");
    });
  });
});
