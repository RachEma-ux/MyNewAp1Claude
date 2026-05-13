/**
 * Yjs adapter tests for the realtime-doc contract — V2 Phase CRDT-γ.
 *
 * The adapter uses a typed `YjsNamespace` interface so unit tests
 * can run locally without the `yjs` package installed. Production
 * callers `import * as Y from "yjs"` and pass Y into the factory.
 *
 * Covers:
 *   - Adapter delegates to the injected `Y.Doc` correctly
 *   - encodeSnapshot calls `Y.encodeStateAsUpdate(doc)`
 *   - applyUpdate calls `Y.applyUpdate(doc, update)`
 *   - getText returns `doc.getText(key).toString()`
 *   - setText replaces prior content via delete-then-insert
 *   - pendingUpdateCount tracks Y.Doc update events
 *   - factory `createYjsRealtimeDocBackend` round-trip
 *   - source-scan boundary: no `import * as Y from "yjs"` in the
 *     adapter file (DI seam preserved); no credential-resolver /
 *     dispatcher / *_API_KEY / neo4j-driver.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import type {
  YDoc,
  YText,
  YjsNamespace,
} from "../../server/agent-studio/services/vault/realtime-doc-backend-yjs.js";
import {
  YjsRealtimeDocBackend,
  createYjsRealtimeDocBackend,
} from "../../server/agent-studio/services/vault/realtime-doc-backend-yjs.js";
import { REALTIME_DOC_TEXT_KEY } from "../../server/agent-studio/services/vault/realtime-doc.js";

function makeFakeYText(initial: string = ""): YText {
  const ref = { text: initial };
  return {
    toString: () => ref.text,
    insert: (index: number, content: string) => {
      ref.text = ref.text.slice(0, index) + content + ref.text.slice(index);
    },
    delete: (index: number, length: number) => {
      ref.text = ref.text.slice(0, index) + ref.text.slice(index + length);
    },
    get length() {
      return ref.text.length;
    },
  } as YText;
}

function makeFakeY(): {
  Y: YjsNamespace;
  encodeStateAsUpdate: ReturnType<typeof vi.fn>;
  applyUpdate: ReturnType<typeof vi.fn>;
  updateHandlers: Array<(u: Uint8Array) => void>;
  textsByKey: Map<string, YText>;
} {
  const updateHandlers: Array<(u: Uint8Array) => void> = [];
  const textsByKey = new Map<string, YText>();

  const fakeDoc: YDoc = {
    getText: (name: string) => {
      let t = textsByKey.get(name);
      if (!t) {
        t = makeFakeYText();
        textsByKey.set(name, t);
      }
      return t;
    },
    on: (event, handler) => {
      if (event === "update") updateHandlers.push(handler);
    },
  };

  const encodeStateAsUpdate = vi.fn(
    (doc: YDoc) => new TextEncoder().encode(`snap:${doc.getText("content").toString()}`),
  );
  const applyUpdate = vi.fn((doc: YDoc, update: Uint8Array) => {
    // Simulate Yjs's update-event after applying.
    for (const h of updateHandlers) h(update);
  });

  const Y: YjsNamespace = {
    Doc: function Doc() {
      return fakeDoc;
    } as unknown as YjsNamespace["Doc"],
    encodeStateAsUpdate,
    applyUpdate,
  };
  return { Y, encodeStateAsUpdate, applyUpdate, updateHandlers, textsByKey };
}

describe("YjsRealtimeDocBackend — DI shape", () => {
  it("constructs against the injected Y namespace + exposes getDoc()", () => {
    const { Y } = makeFakeY();
    const backend = new YjsRealtimeDocBackend(Y);
    expect(backend.getDoc()).toBeDefined();
  });

  it("createYjsRealtimeDocBackend factory returns an instance", () => {
    const { Y } = makeFakeY();
    const backend = createYjsRealtimeDocBackend(Y);
    expect(backend).toBeInstanceOf(YjsRealtimeDocBackend);
  });
});

describe("YjsRealtimeDocBackend — encode/apply/get/setText", () => {
  it("encodeSnapshot delegates to Y.encodeStateAsUpdate", () => {
    const { Y, encodeStateAsUpdate } = makeFakeY();
    const backend = new YjsRealtimeDocBackend(Y);
    const snap = backend.encodeSnapshot();
    expect(encodeStateAsUpdate).toHaveBeenCalledTimes(1);
    expect(new TextDecoder().decode(snap)).toBe("snap:");
  });

  it("applyUpdate delegates to Y.applyUpdate", () => {
    const { Y, applyUpdate } = makeFakeY();
    const backend = new YjsRealtimeDocBackend(Y);
    const update = new Uint8Array([1, 2, 3]);
    backend.applyUpdate(update);
    expect(applyUpdate).toHaveBeenCalledTimes(1);
    expect(applyUpdate.mock.calls[0][1]).toBe(update);
  });

  it("getText uses doc.getText(key).toString()", () => {
    const { Y, textsByKey } = makeFakeY();
    const backend = new YjsRealtimeDocBackend(Y);
    expect(backend.getText()).toBe("");
    // Inject content directly into the fake Y.Text.
    textsByKey.get(REALTIME_DOC_TEXT_KEY)?.insert(0, "hello");
    expect(backend.getText()).toBe("hello");
  });

  it("setText replaces prior content via delete-then-insert", () => {
    const { Y } = makeFakeY();
    const backend = new YjsRealtimeDocBackend(Y);
    backend.setText("first");
    expect(backend.getText()).toBe("first");
    backend.setText("second");
    expect(backend.getText()).toBe("second");
  });

  it("setText honors a custom key", () => {
    const { Y } = makeFakeY();
    const backend = new YjsRealtimeDocBackend(Y);
    backend.setText("alt", "title");
    expect(backend.getText("title")).toBe("alt");
    expect(backend.getText()).toBe("");
  });
});

describe("YjsRealtimeDocBackend — pendingUpdateCount", () => {
  it("starts at 0 and increments on Y.Doc update events", () => {
    const { Y } = makeFakeY();
    const backend = new YjsRealtimeDocBackend(Y);
    expect(backend.pendingUpdateCount()).toBe(0);
    backend.applyUpdate(new Uint8Array([1]));
    backend.applyUpdate(new Uint8Array([2]));
    expect(backend.pendingUpdateCount()).toBe(2);
  });

  it("resetPending zeroes the counter", () => {
    const { Y } = makeFakeY();
    const backend = new YjsRealtimeDocBackend(Y);
    backend.applyUpdate(new Uint8Array([1]));
    backend.resetPending();
    expect(backend.pendingUpdateCount()).toBe(0);
  });
});

describe("source-scan boundary — realtime-doc-backend-yjs.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/realtime-doc-backend-yjs.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");

  it("does NOT top-level-import yjs (DI seam preserved)", () => {
    // Top-level `import * as Y from "yjs"` is forbidden — production
    // passes Y via the factory; tests use a typed fake. Adapter file
    // declares only the YjsNamespace interface.
    expect(/^\s*import\s+[^;]*\s+from\s+["']yjs["']/m.test(code)).toBe(false);
  });

  it("does not import credential-resolver", () => {
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("does not import the MCP dispatcher", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        code,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY raw", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(code)).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });
});
