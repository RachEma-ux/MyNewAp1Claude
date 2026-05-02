import { describe, expect, it } from "vitest";
import {
  collectBaseRoutes,
  extractAppRoutes,
} from "../../scripts/module-tools/route-inventory";
import type { ManifestSnapshot } from "../../scripts/module-tools/manifest-reader";

describe("extractAppRoutes", () => {
  it("pulls Route declarations with inline JSX-heavy components", () => {
    const src = `
      <Route path="/foo" component={() => <ProtectedRoute component={FooPage} />} />
      <Route path="/bar/:id?" component={() => <ProtectedRoute component={() => <BarPage />} />} />
      <Route path="/chat"><Redirect to="/communication/chat" /></Route>
    `;
    const out = extractAppRoutes(src);
    expect(out.map((r) => r.path)).toEqual(["/foo", "/bar/:id?", "/chat"]);
    const chat = out.find((r) => r.path === "/chat");
    expect(chat?.redirectTo).toBe("/communication/chat");
  });
  it("ignores ModuleRoutes / ProtectedRoute non-Route opens", () => {
    const src = `<ProtectedRoute path="/x" /><ModuleRoutes />`;
    expect(extractAppRoutes(src)).toEqual([]);
  });
});

describe("collectBaseRoutes", () => {
  function snap(over: Partial<ManifestSnapshot>): ManifestSnapshot {
    return {
      key: "x",
      name: "X",
      folder: "x",
      manifestPath: "",
      manifestExists: true,
      routes: [],
      navigationLabels: [],
      requiredPermissions: [],
      baseRoute: null,
      capsuleEntrypoint: null,
      layoutMode: null,
      layoutReason: null,
      routeInventory: [],
      compatibilityRoutes: [],
      deprecatedRoutes: [],
      navHrefs: [],
      routesFileEntries: [],
      warnings: [],
      ...over,
    };
  }
  it("prefers explicit baseRoute over heuristic", () => {
    const map = collectBaseRoutes([
      snap({ key: "communication", folder: "communication", baseRoute: "/communication" }),
    ]);
    expect(map.get("/communication")).toBe("communication");
  });
  it("falls back to shortest literal route for legacy modules", () => {
    const map = collectBaseRoutes([
      snap({
        key: "agentStudio",
        folder: "agent-studio",
        routes: [
          { path: "/agent-studio/templates" },
          { path: "/agent-studio" },
          { path: "/agent-studio/:agentId" },
        ],
      }),
    ]);
    expect(map.get("/agent-studio")).toBe("agentStudio");
  });
  it("ignores dynamic-only routes for legacy fallback", () => {
    const map = collectBaseRoutes([
      snap({
        key: "aiTypes",
        folder: "ai-types",
        routes: [
          { path: "/ai-types/:rest*" },
          { path: "/ai-types" },
        ],
      }),
    ]);
    expect(map.get("/ai-types")).toBe("aiTypes");
  });
});
