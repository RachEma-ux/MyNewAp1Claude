import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { readManifestFor } from "../../scripts/module-tools/manifest-reader";

function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "manifest-reader-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(full.replace(/\/[^/]+$/, ""), { recursive: true });
    writeFileSync(full, body, "utf8");
  }
  return root;
}

describe("readManifestFor — legacy shape", () => {
  it("reads key, name, routes from a today-style manifest", () => {
    const root = makeRepo({
      "client/src/modules/communication/manifest.ts": `
        import type { ClientModuleManifest } from "@/platform/modules/types";
        export const communicationClientManifest: ClientModuleManifest = {
          key: "communication",
          name: "Communication",
          routes: [
            { path: "/communication/chat", label: "Chat" },
            { path: "/communication/conversations", label: "Conversations" },
          ],
          navigation: [{ group: "comm", label: "Communication" }],
          requiredPermissions: ["communication.read"],
        };
      `,
    });
    const snap = readManifestFor(root, "communication", "communication");
    expect(snap.key).toBe("communication");
    expect(snap.name).toBe("Communication");
    expect(snap.routes.map((r) => r.path)).toEqual([
      "/communication/chat",
      "/communication/conversations",
    ]);
    expect(snap.requiredPermissions).toContain("communication.read");
    expect(snap.baseRoute).toBeNull();
    expect(snap.capsuleEntrypoint).toBeNull();
    // Unmigrated → reader still records the warnings for the baseline doc.
    expect(snap.warnings.some((w) => /baseRoute/.test(w))).toBe(true);
  });
});

describe("readManifestFor — capsule shape", () => {
  it("reads baseRoute, capsuleEntrypoint, layoutMode, routeInventory, compatibilityRoutes", () => {
    const root = makeRepo({
      "client/src/modules/communication/manifest.ts": `
        export const communicationClientManifest = {
          key: "communication",
          name: "Communication",
          baseRoute: "/communication",
          capsuleEntrypoint: () => null,
          layoutMode: "inside-main-layout",
          routeInventory: [
            "/communication",
            "/communication/chat",
          ],
          compatibilityRoutes: [
            { from: "/chat", to: "/communication/chat", reason: "legacy" },
          ],
          deprecatedRoutes: [],
          requiredPermissions: ["communication.read"],
          routes: [],
        };
      `,
    });
    const snap = readManifestFor(root, "communication", "communication");
    expect(snap.baseRoute).toBe("/communication");
    expect(snap.layoutMode).toBe("inside-main-layout");
    expect(snap.routeInventory).toEqual([
      "/communication",
      "/communication/chat",
    ]);
    expect(snap.compatibilityRoutes).toEqual([
      { from: "/chat", to: "/communication/chat", reason: "legacy" },
    ]);
  });
});

describe("readManifestFor — missing manifest", () => {
  it("does not throw and emits a warning", () => {
    const root = makeRepo({});
    const snap = readManifestFor(root, "communication", "communication");
    expect(snap.manifestExists).toBe(false);
    expect(snap.warnings.some((w) => /manifest missing/.test(w))).toBe(true);
  });
});

describe("readManifestFor — sibling files", () => {
  it("reads paths from nav.ts and routes.tsx", () => {
    const root = makeRepo({
      "client/src/modules/communication/manifest.ts": `
        export const x = { key: "communication", name: "C", routes: [] };
      `,
      "client/src/modules/communication/nav.ts": `
        export const nav = [{ href: "/communication/chat" }];
      `,
      "client/src/modules/communication/routes.tsx": `
        export const routes = [
          { path: "/communication/chat" },
          { path: "/communication/notifications" },
        ];
      `,
    });
    const snap = readManifestFor(root, "communication", "communication");
    expect(snap.navHrefs).toContain("/communication/chat");
    expect(snap.routesFileEntries).toContain("/communication/chat");
    expect(snap.routesFileEntries).toContain("/communication/notifications");
  });
});
