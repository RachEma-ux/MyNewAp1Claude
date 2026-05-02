import { describe, expect, it } from "vitest";
import {
  compareBaseRoutePriority,
  isBaseRouteMatch,
  normalizePath,
  patternToRegex,
  routePatternMatches,
  sortBaseRoutes,
} from "../../scripts/module-tools/route-parser";

describe("normalizePath", () => {
  it("forces a leading slash", () => {
    expect(normalizePath("foo/bar")).toBe("/foo/bar");
  });
  it("collapses duplicate slashes", () => {
    expect(normalizePath("//foo///bar")).toBe("/foo/bar");
  });
  it("drops trailing slash except root", () => {
    expect(normalizePath("/foo/")).toBe("/foo");
    expect(normalizePath("/")).toBe("/");
  });
  it("is idempotent", () => {
    const p = normalizePath("/a/b");
    expect(normalizePath(p)).toBe(p);
  });
});

describe("isBaseRouteMatch", () => {
  it("matches exact path", () => {
    expect(isBaseRouteMatch("/ps", "/ps")).toBe(true);
  });
  it("matches with trailing slash", () => {
    expect(isBaseRouteMatch("/ps", "/ps/")).toBe(true);
  });
  it("matches descendant paths", () => {
    expect(isBaseRouteMatch("/ps", "/ps/foo")).toBe(true);
    expect(isBaseRouteMatch("/ps", "/ps/foo/bar")).toBe(true);
  });
  it("rejects /ps vs /psm — segment boundary", () => {
    expect(isBaseRouteMatch("/ps", "/psm")).toBe(false);
    expect(isBaseRouteMatch("/ps", "/psm/foo")).toBe(false);
  });
  it("rejects /pm vs /pm-central — different segment", () => {
    expect(isBaseRouteMatch("/pm", "/pm-central")).toBe(false);
    expect(isBaseRouteMatch("/pm", "/pm-central/foo")).toBe(false);
  });
  it("matches /data-analysis subdomain prefix", () => {
    expect(isBaseRouteMatch("/data-analysis", "/data-analysis/data-acquisition")).toBe(true);
  });
  it("root catches everything", () => {
    expect(isBaseRouteMatch("/", "/anything/here")).toBe(true);
  });
});

describe("compareBaseRoutePriority + sortBaseRoutes", () => {
  it("sorts longer baseRoutes first, lexical tiebreak for equal length", () => {
    // /communication (14) and /data-analysis (14) are equal-length, so
    // lexical "c" beats "d" — that's the tiebreak invariant.
    const result = sortBaseRoutes([
      { baseRoute: "/data-analysis" },
      { baseRoute: "/data-analysis/data-acquisition" },
      { baseRoute: "/communication" },
    ]);
    expect(result.map((r) => r.baseRoute)).toEqual([
      "/data-analysis/data-acquisition",
      "/communication",
      "/data-analysis",
    ]);
  });
  it("uses lexical tiebreak for equal-length", () => {
    expect(compareBaseRoutePriority("/aaa", "/bbb")).toBeLessThan(0);
    expect(compareBaseRoutePriority("/bbb", "/aaa")).toBeGreaterThan(0);
  });
});

describe("patternToRegex / routePatternMatches", () => {
  it("matches literal segment", () => {
    expect(routePatternMatches("/foo/bar", "/foo/bar")).toBe(true);
    expect(routePatternMatches("/foo/bar", "/foo/baz")).toBe(false);
  });
  it("matches required parameter", () => {
    expect(routePatternMatches("/foo/:id", "/foo/123")).toBe(true);
    expect(routePatternMatches("/foo/:id", "/foo")).toBe(false);
  });
  it("matches optional parameter", () => {
    expect(routePatternMatches("/foo/:id?", "/foo")).toBe(true);
    expect(routePatternMatches("/foo/:id?", "/foo/123")).toBe(true);
    expect(routePatternMatches("/foo/:id?", "/foo/123/extra")).toBe(false);
  });
  it("matches named splat", () => {
    expect(routePatternMatches("/ai-types/:rest*", "/ai-types")).toBe(true);
    expect(routePatternMatches("/ai-types/:rest*", "/ai-types/x")).toBe(true);
    expect(routePatternMatches("/ai-types/:rest*", "/ai-types/x/y/z")).toBe(true);
  });
  it("matches anonymous splat", () => {
    expect(routePatternMatches("/foo/*", "/foo")).toBe(true);
    expect(routePatternMatches("/foo/*", "/foo/anything")).toBe(true);
  });
  it("anchors fully (no partial match)", () => {
    expect(routePatternMatches("/foo", "/foo/extra")).toBe(false);
  });
  it("normalizes trailing slash differences", () => {
    expect(routePatternMatches("/foo", "/foo/")).toBe(true);
  });
  it("regex compiles for splat patterns", () => {
    const re = patternToRegex("/agent-studio/:rest*");
    expect(re.test("/agent-studio")).toBe(true);
    expect(re.test("/agent-studio/foo")).toBe(true);
  });
});
