/**
 * Agent 4 — Audit Blocking Tests
 *
 * Validates invariant I6: Audit blocks critical mutation.
 * Every governance transition must leave a version trail.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  createTestBundle,
  makeEntryAvailable,
} from "../helpers/governance-harness";
import {
  getCatalogEntryById,
  updateCatalogEntry,
  approveCatalogEntry,
  getCatalogEntryVersions,
} from "../../server/db/catalog";

describe.runIf(hasDb)("Audit Blocking — I6", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("I6: every state change creates a version record", async () => {
    const entry = await createTestEntry({
      entryType: "agent",
      status: "draft",
      reviewState: "needs_review",
      config: { step: 0 },
    });

    // Version 1 from creation
    let versions = await getCatalogEntryVersions(entry.id);
    expect(versions.length).toBe(1);

    // Approve → version 2
    await approveCatalogEntry(entry.id, 1);
    versions = await getCatalogEntryVersions(entry.id);
    expect(versions.length).toBe(2);

    // Activate → version 3
    await updateCatalogEntry(entry.id, { status: "active" }, 1);
    versions = await getCatalogEntryVersions(entry.id);
    expect(versions.length).toBe(3);

    // Config update → version 4
    await updateCatalogEntry(entry.id, { config: { step: 1 } }, 1);
    versions = await getCatalogEntryVersions(entry.id);
    expect(versions.length).toBe(4);
  });

  it("I6: version records are ordered with newest first", async () => {
    const entry = await createTestEntry({ config: { v: 1 } });

    await updateCatalogEntry(entry.id, { config: { v: 2 } }, 1);
    await updateCatalogEntry(entry.id, { config: { v: 3 } }, 1);

    const versions = await getCatalogEntryVersions(entry.id);
    expect(versions.length).toBe(3);
    expect(versions[0].version).toBe(3);
    expect(versions[1].version).toBe(2);
    expect(versions[2].version).toBe(1);
  });

  it("I6: publish bundle creates immutable snapshot with hash", async () => {
    const entry = await createTestEntry({
      entryType: "bot",
      status: "active",
      reviewState: "approved",
    });

    const bundle = await createTestBundle(entry.id, {
      snapshot: { frozen: true, config: { key: "locked" } },
    });

    expect(bundle.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.status).toBe("active");
    expect((bundle.snapshot as any).frozen).toBe(true);
  });

  it("I6: second bundle supersedes the first", async () => {
    const { getActiveBundleForEntry } = await import("../../server/db/catalog");

    const entry = await createTestEntry({
      entryType: "agent",
      status: "active",
      reviewState: "approved",
    });

    const b1 = await createTestBundle(entry.id, {
      versionLabel: `v1-audit-${Date.now()}`,
      snapshot: { v: 1 },
    });

    const b2 = await createTestBundle(entry.id, {
      versionLabel: `v2-audit-${Date.now()}`,
      snapshot: { v: 2 },
    });

    const active = await getActiveBundleForEntry(entry.id);
    expect(active).not.toBeNull();
    expect(active!.id).toBe(b2.id);
  });
});
