/**
 * Track A — A4 — Vault FS-sync chokidar watcher tests.
 *
 * Exercises the chokidar wrapper against per-test tmp directories.
 * Verifies: add/change/unlink delivery, .tmp filtering, debouncing,
 * WatcherManager lifecycle (start/stop/restart on root change).
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  startVaultWatcher,
  WatcherManager,
  type FsSyncWatcherEvent,
} from "../../server/agent-studio/services/vault/fs-sync/watcher";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "vault-fs-sync-watcher-"));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

/**
 * Poll until `predicate()` returns true or `timeoutMs` elapses.
 * Chokidar's awaitWriteFinish (200ms stability) + our debounce (set
 * to 0 in tests) means events arrive within a few hundred ms; we
 * cap at 3000ms.
 */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 30));
  }
}

describe("A4 — startVaultWatcher", () => {
  it("emits an 'add' event when a .md file appears", async () => {
    const events: FsSyncWatcherEvent[] = [];
    const handle = startVaultWatcher({
      vaultId: 1,
      vaultRoot: tmpRoot,
      onEvent: (e) => {
        events.push(e);
      },
      debounceMs: 0,
    });
    try {
      const target = join(tmpRoot, "hello.md");
      await writeFile(target, "# Hello", "utf8");
      await waitFor(
        () => events.some((e) => e.kind === "add" && e.absPath === target),
      );
      const add = events.find((e) => e.kind === "add");
      expect(add).toBeDefined();
      expect(add!.vaultId).toBe(1);
      expect(add!.vaultRoot).toBe(tmpRoot);
    } finally {
      await handle.close();
    }
  });

  it("emits a 'change' event on subsequent write", async () => {
    const target = join(tmpRoot, "change.md");
    await writeFile(target, "v1", "utf8");
    const events: FsSyncWatcherEvent[] = [];
    const handle = startVaultWatcher({
      vaultId: 7,
      vaultRoot: tmpRoot,
      onEvent: (e) => {
        events.push(e);
      },
      debounceMs: 0,
    });
    try {
      // Wait for the initial add to settle so we can distinguish it
      // from the change.
      await waitFor(() => events.some((e) => e.kind === "add"));
      events.length = 0;
      await writeFile(target, "v2", "utf8");
      await waitFor(() => events.some((e) => e.kind === "change"));
      const ch = events.find((e) => e.kind === "change");
      expect(ch).toBeDefined();
      expect(ch!.absPath).toBe(target);
    } finally {
      await handle.close();
    }
  });

  it("emits 'unlink' when a watched .md file is deleted", async () => {
    const target = join(tmpRoot, "doomed.md");
    await writeFile(target, "x", "utf8");
    const events: FsSyncWatcherEvent[] = [];
    const handle = startVaultWatcher({
      vaultId: 9,
      vaultRoot: tmpRoot,
      onEvent: (e) => {
        events.push(e);
      },
      debounceMs: 0,
    });
    try {
      await waitFor(() => events.some((e) => e.kind === "add"));
      events.length = 0;
      await unlink(target);
      await waitFor(() => events.some((e) => e.kind === "unlink"));
    } finally {
      await handle.close();
    }
  });

  it("ignores .tmp staging files (avoids half-written read)", async () => {
    const tmpStaging = join(tmpRoot, "atomic.md.tmp");
    const events: FsSyncWatcherEvent[] = [];
    const handle = startVaultWatcher({
      vaultId: 2,
      vaultRoot: tmpRoot,
      onEvent: (e) => {
        events.push(e);
      },
      debounceMs: 0,
    });
    try {
      await writeFile(tmpStaging, "partial", "utf8");
      // Give chokidar 500ms to notice — it should NOT fire because
      // .tmp is excluded.
      await new Promise((r) => setTimeout(r, 500));
      expect(events.some((e) => e.absPath === tmpStaging)).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it("ignores .fs-sync.lock and dotfiles", async () => {
    const lockPath = join(tmpRoot, ".fs-sync.lock");
    const events: FsSyncWatcherEvent[] = [];
    const handle = startVaultWatcher({
      vaultId: 3,
      vaultRoot: tmpRoot,
      onEvent: (e) => {
        events.push(e);
      },
      debounceMs: 0,
    });
    try {
      await writeFile(lockPath, String(process.pid), "utf8");
      await new Promise((r) => setTimeout(r, 500));
      expect(events.some((e) => e.absPath === lockPath)).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it("debounces rapid back-to-back writes to a single event", async () => {
    const target = join(tmpRoot, "rapid.md");
    const events: FsSyncWatcherEvent[] = [];
    const handle = startVaultWatcher({
      vaultId: 4,
      vaultRoot: tmpRoot,
      onEvent: (e) => {
        events.push(e);
      },
      debounceMs: 400,
    });
    try {
      await writeFile(target, "v1", "utf8");
      // Wait briefly so the add fires, then issue two rapid changes
      // and verify the debounce collapses them.
      await waitFor(() => events.some((e) => e.kind === "add"));
      events.length = 0;
      await writeFile(target, "v2", "utf8");
      await new Promise((r) => setTimeout(r, 50));
      await writeFile(target, "v3", "utf8");
      await new Promise((r) => setTimeout(r, 700));
      const changeCount = events.filter(
        (e) => e.kind === "change" && e.absPath === target,
      ).length;
      // Should be exactly one delivered change event after debouncing.
      expect(changeCount).toBe(1);
    } finally {
      await handle.close();
    }
  });
});

describe("A4 — WatcherManager", () => {
  it("getOrStart creates a watcher per vault and reuses existing", async () => {
    const mgr = new WatcherManager();
    try {
      const h1 = await mgr.getOrStart({
        vaultId: 1,
        vaultRoot: tmpRoot,
        onEvent: () => {},
        debounceMs: 0,
      });
      expect(mgr.size()).toBe(1);
      expect(mgr.has(1)).toBe(true);
      const h2 = await mgr.getOrStart({
        vaultId: 1,
        vaultRoot: tmpRoot,
        onEvent: () => {},
        debounceMs: 0,
      });
      expect(h2).toBe(h1); // same root → same handle
      expect(mgr.size()).toBe(1);
    } finally {
      await mgr.closeAll();
    }
  });

  it("restarts the watcher when vaultRoot changes", async () => {
    const tmpRootB = await mkdtemp(join(tmpdir(), "vault-fs-sync-watcher-b-"));
    try {
      const mgr = new WatcherManager();
      try {
        const h1 = await mgr.getOrStart({
          vaultId: 1,
          vaultRoot: tmpRoot,
          onEvent: () => {},
          debounceMs: 0,
        });
        const h2 = await mgr.getOrStart({
          vaultId: 1,
          vaultRoot: tmpRootB,
          onEvent: () => {},
          debounceMs: 0,
        });
        expect(h2).not.toBe(h1);
        expect(mgr.vaultRootFor(1)).toBe(tmpRootB);
        expect(mgr.size()).toBe(1); // not 2 — old root closed
      } finally {
        await mgr.closeAll();
      }
    } finally {
      await rm(tmpRootB, { recursive: true, force: true });
    }
  });

  it("stop removes the watcher entry; closeAll drains the registry", async () => {
    const mgr = new WatcherManager();
    await mgr.getOrStart({
      vaultId: 1,
      vaultRoot: tmpRoot,
      onEvent: () => {},
      debounceMs: 0,
    });
    await mgr.getOrStart({
      vaultId: 2,
      vaultRoot: tmpRoot,
      onEvent: () => {},
      debounceMs: 0,
    });
    expect(mgr.size()).toBe(2);
    await mgr.stop(1);
    expect(mgr.has(1)).toBe(false);
    expect(mgr.has(2)).toBe(true);
    await mgr.closeAll();
    expect(mgr.size()).toBe(0);
  });
});
