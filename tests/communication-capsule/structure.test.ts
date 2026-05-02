/**
 * Communication Capsule — Structural invariants.
 *
 * Static checks that exercise the capsule's contract without
 * needing a React renderer or trpc mocks. These are the failure
 * modes a capsule migration is most likely to silently introduce.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

import { readManifestFor } from "../../scripts/module-tools/manifest-reader";
import {
  isMigrated,
  RTLM_FOLDER_MAP,
} from "../../scripts/module-tools/migration-state";
import {
  isBaseRouteMatch,
  normalizePath,
  routePatternMatches,
} from "../../scripts/module-tools/route-parser";
import { extractAppRoutes } from "../../scripts/module-tools/route-inventory";
import { scanFileForBoundaries } from "../../scripts/module-tools/boundary-rules";

const REPO_ROOT = process.cwd();
const COMM_DIR = join(REPO_ROOT, "client", "src", "modules", "communication");
const APP_PATH = join(REPO_ROOT, "client", "src", "App.tsx");

describe("Communication capsule files exist", () => {
  it.each([
    "client.ts",
    "manifest.ts",
    "mod.tsx",
    "routes.tsx",
    "nav.ts",
    "index.ts",
    "types.ts",
    "components/CommunicationShell.tsx",
  ])("has %s", (rel) => {
    expect(existsSync(join(COMM_DIR, rel))).toBe(true);
  });

  it.each([
    "CommunicationDashboardPage.tsx",
    "CommunicationChatPage.tsx",
    "CommunicationConversationsPage.tsx",
    "CommunicationVideoMeetingPage.tsx",
    "CommunicationNotificationsPage.tsx",
  ])("has page %s", (rel) => {
    expect(existsSync(join(COMM_DIR, "pages", rel))).toBe(true);
  });
});

describe("Communication migration state", () => {
  it("is in MIGRATED_MODULES", () => {
    expect(isMigrated("communication")).toBe(true);
  });
});

describe("Communication manifest", () => {
  const snap = readManifestFor(REPO_ROOT, "communication", "communication");

  it("declares baseRoute /communication", () => {
    expect(snap.baseRoute).toBe("/communication");
  });
  it("declares a capsuleEntrypoint", () => {
    expect(snap.capsuleEntrypoint).toBeTruthy();
  });
  it("layoutMode is inside-main-layout", () => {
    expect(snap.layoutMode).toBe("inside-main-layout");
  });
  it("routeInventory includes the 5 canonical routes", () => {
    const set = new Set(snap.routeInventory.map(normalizePath));
    expect(set).toEqual(
      new Set([
        "/communication",
        "/communication/chat",
        "/communication/conversations",
        "/communication/video-meeting",
        "/communication/notifications",
      ]),
    );
  });
  it("declares the 3 compatibility redirects", () => {
    const fromTo = snap.compatibilityRoutes.map((c) => `${c.from}=>${c.to}`).sort();
    expect(fromTo).toEqual([
      "/chat=>/communication/chat",
      "/conversations=>/communication/conversations",
      "/video-meeting=>/communication/video-meeting",
    ]);
  });
  it("manifest.routes is empty (capsule mode)", () => {
    expect(snap.routes).toEqual([]);
  });
});

describe("routeInventory ⊆ routes.tsx", () => {
  const snap = readManifestFor(REPO_ROOT, "communication", "communication");

  it("every routeInventory path is matched by a routes.tsx pattern", () => {
    for (const inv of snap.routeInventory) {
      const matched = snap.routesFileEntries.some((p) =>
        routePatternMatches(p, inv),
      );
      expect(matched, `routeInventory ${inv} not matched in routes.tsx`).toBe(
        true,
      );
    }
  });
});

describe("App.tsx ownership", () => {
  const appSrc = readFileSync(APP_PATH, "utf8");
  const appRoutes = extractAppRoutes(appSrc);
  const folder = RTLM_FOLDER_MAP.communication;

  it("does not lazy-import any private Communication page", () => {
    expect(appSrc).not.toMatch(
      new RegExp(`import\\([^)]*?modules/${folder}/pages/`),
    );
  });

  it("mounts no canonical /communication/* route directly", () => {
    const offending = appRoutes.filter((r) => {
      const p = normalizePath(r.path);
      return isBaseRouteMatch("/communication", p) && !r.redirectTo;
    });
    expect(offending.map((r) => r.path)).toEqual([]);
  });

  it("keeps the three legacy redirects as <Redirect>", () => {
    const redirects = appRoutes.filter((r) => r.redirectTo);
    const fromTo = redirects.map((r) => `${normalizePath(r.path)}=>${normalizePath(r.redirectTo!)}`);
    expect(fromTo).toContain("/chat=>/communication/chat");
    expect(fromTo).toContain("/conversations=>/communication/conversations");
    expect(fromTo).toContain("/video-meeting=>/communication/video-meeting");
  });
});

describe("Boundary discipline", () => {
  // Walk every .ts/.tsx in client/src/modules/communication and
  // assert the boundary scanner finds zero violations. This is the
  // same logic check:module-api-boundaries runs, here as a fast
  // unit assertion local to Communication.
  const findings = collectAllBoundaryFindings(COMM_DIR);

  it("no MainLayout import inside the capsule", () => {
    const main = findings.filter((f) => f.kind === "main-layout-import");
    expect(main.map((f) => f.file)).toEqual([]);
  });

  it("no cross-module trpc.<other>.* call inside the capsule", () => {
    const trpc = findings.filter((f) => f.kind === "cross-module-trpc");
    expect(trpc.map((f) => `${f.file}: ${f.evidence}`)).toEqual([]);
  });

  it("no private cross-module imports out of the capsule", () => {
    const priv = findings.filter((f) => f.kind === "private-import");
    expect(priv.map((f) => `${f.file}: ${f.evidence}`)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

function collectAllBoundaryFindings(root: string) {
  const out: ReturnType<typeof scanFileForBoundaries> = [];
  walk(root);
  return out;

  function walk(dir: string) {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (e.endsWith(".ts") || e.endsWith(".tsx")) {
        const rel = full.slice(REPO_ROOT.length + 1);
        const src = readFileSync(full, "utf8");
        out.push(...scanFileForBoundaries(rel, src));
      }
    }
  }
}
