/**
 * Vitest setup — runs before each test file.
 *
 * Polyfills browser-only globals that jsdom does not implement
 * out of the box (ResizeObserver, IntersectionObserver) so that
 * client-side components which rely on them can mount in tests.
 *
 * Also registers an `afterEach` hook that calls
 * `@testing-library/react#cleanup` between tests in jsdom-mode
 * files, so DOM mutations don't leak across test cases. The
 * cleanup is loaded lazily and silently skipped for tests that
 * never used `render` (e.g. server-only suites).
 */
import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof document === "undefined") return;
  try {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  } catch {
    // RTL not installed in this environment — nothing to clean.
  }
});

if (typeof globalThis.ResizeObserver === "undefined") {
  // Minimal no-op polyfill — components that wire ResizeObserver
  // for layout measurement do not assert on observed entries; they
  // just need the constructor to exist and be callable.
  class ResizeObserverPolyfill {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as any).ResizeObserver = ResizeObserverPolyfill;
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  class IntersectionObserverPolyfill {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds = [] as ReadonlyArray<number>;
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  (globalThis as any).IntersectionObserver = IntersectionObserverPolyfill;
}
