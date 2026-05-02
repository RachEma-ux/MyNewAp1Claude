import { describe, expect, it } from "vitest";
import {
  classifyRouteForAwi,
  isPlatformCorePath,
  resolveRouteSource,
  type RouteResolutionContext,
} from "../../scripts/module-tools/route-source";

function ctx(over: Partial<RouteResolutionContext> = {}): RouteResolutionContext {
  return {
    moduleBaseRoutes: new Map(),
    manifestRoutePaths: new Set(),
    modRoutePaths: new Set(),
    navOnlyPaths: new Set(),
    appRedirectFromPaths: new Set(),
    deprecatedPaths: new Set(),
    ...over,
  };
}

describe("isPlatformCorePath", () => {
  it("matches platform-core prefixes", () => {
    expect(isPlatformCorePath("/governance")).toBe(true);
    expect(isPlatformCorePath("/governance/overview")).toBe(true);
    expect(isPlatformCorePath("/auth/login")).toBe(true);
    expect(isPlatformCorePath("/system/whatever")).toBe(true);
  });
  it("rejects RTLM-owned paths", () => {
    expect(isPlatformCorePath("/communication/chat")).toBe(false);
    expect(isPlatformCorePath("/data-analysis")).toBe(false);
  });
  it("respects segment boundary (no /governanceX hijack)", () => {
    expect(isPlatformCorePath("/governanceXyz")).toBe(false);
  });
});

describe("resolveRouteSource", () => {
  it("classifies platform-core", () => {
    const r = resolveRouteSource("/governance/overview", ctx());
    expect(r.source).toBe("app-platform-core");
    expect(r.owner).toBe("platform-core");
  });
  it("classifies module manifest path", () => {
    const r = resolveRouteSource(
      "/communication/chat",
      ctx({
        manifestRoutePaths: new Set(["/communication/chat"]),
        moduleBaseRoutes: new Map([["/communication", "communication"]]),
      }),
    );
    expect(r.source).toBe("module-manifest");
    expect(r.owner).toBe("communication");
  });
  it("classifies compatibility redirect", () => {
    const r = resolveRouteSource(
      "/chat",
      ctx({
        appRedirectFromPaths: new Set(["/chat"]),
        moduleBaseRoutes: new Map([["/communication", "communication"]]),
      }),
    );
    expect(r.source).toBe("app-compatibility-redirect");
    expect(r.owner).toBe(null); // /chat doesn't fall under /communication baseRoute
  });
  it("classifies module-mod-route", () => {
    const r = resolveRouteSource(
      "/communication/notifications",
      ctx({
        modRoutePaths: new Set(["/communication/notifications"]),
        moduleBaseRoutes: new Map([["/communication", "communication"]]),
      }),
    );
    expect(r.source).toBe("module-mod-route");
    expect(r.owner).toBe("communication");
  });
  it("classifies orphan nav-only", () => {
    const r = resolveRouteSource(
      "/communication/orphan",
      ctx({
        navOnlyPaths: new Set(["/communication/orphan"]),
        moduleBaseRoutes: new Map([["/communication", "communication"]]),
      }),
    );
    expect(r.source).toBe("module-nav");
    expect(r.owner).toBe("communication");
  });
  it("returns unknown when nothing claims the path", () => {
    const r = resolveRouteSource("/dangling", ctx());
    expect(r.source).toBe("unknown");
    expect(r.owner).toBe(null);
  });
});

describe("classifyRouteForAwi", () => {
  it("agrees with resolveRouteSource on the basic cases", () => {
    expect(
      classifyRouteForAwi("/communication/chat", {
        manifestPaths: new Set(["/communication/chat"]),
        modRoutePaths: new Set(),
        navOnlyPaths: new Set(),
        deprecatedPaths: new Set(),
        appRedirectFromPaths: new Set(),
      }),
    ).toBe("module-manifest");
    expect(
      classifyRouteForAwi("/governance/overview", {
        manifestPaths: new Set(),
        modRoutePaths: new Set(),
        navOnlyPaths: new Set(),
        deprecatedPaths: new Set(),
        appRedirectFromPaths: new Set(),
      }),
    ).toBe("app-platform-core");
  });
});
