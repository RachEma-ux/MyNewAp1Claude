/**
 * Region admin mutation UI source-scan — PR-V1-172.
 *
 * Adds operator-facing setPin / removePin mutation UIs to the
 * Region admin panel. Verifies the form + Remove button are wired
 * to the existing tRPC mutations + invalidate the right caches on
 * success.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-172 — region admin mutation UI", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/RegionAdminPanel.tsx",
  );

  it("imports Input + Button + useState + useUtils", () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain('import { useState } from "react"');
    expect(src).toContain('import { Input } from "@/components/ui/input"');
    expect(src).toContain('import { Button } from "@/components/ui/button"');
    expect(src).toContain("trpc.useUtils()");
  });

  it("wires the setPin + removePin mutations", () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("trpc.agentStudio.region.setPin.useMutation");
    expect(src).toContain("trpc.agentStudio.region.removePin.useMutation");
  });

  it("invalidates the affected caches on mutation success", () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain(
      "utils.agentStudio.region.listPins.invalidate()",
    );
    expect(src).toContain(
      "utils.agentStudio.region.getCacheStatus.invalidate()",
    );
    expect(src).toContain(
      "utils.agentStudio.region.getPubsubStatus.invalidate()",
    );
  });

  it("surfaces mutation errors via mutationError state", () => {
    const src = readFileSync(file, "utf8");
    expect(/setMutationError\(err\.message\)/.test(src)).toBe(true);
    expect(/text-destructive/.test(src)).toBe(true);
  });

  it("validates workspaceId as a positive integer before mutate", () => {
    const src = readFileSync(file, "utf8");
    expect(
      /Number\.parseInt\(pinForm\.workspaceId,\s*10\)/.test(src),
    ).toBe(true);
    expect(/!Number\.isFinite\(wsId\)\s*\|\|\s*wsId\s*<=\s*0/.test(src)).toBe(
      true,
    );
  });

  it("offers an inline datalist of known region keys", () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain('id="region-admin-region-keys"');
    expect(src).toContain('list="region-admin-region-keys"');
    expect(/regionsQ\.data\?\.map\(\(r\)\s*=>/.test(src)).toBe(true);
  });

  it("Set button is disabled while mutation is pending OR required fields are empty", () => {
    const src = readFileSync(file, "utf8");
    expect(
      /disabled=\{\s*setPinMutation\.isPending\s*\|\|\s*!pinForm\.workspaceId\s*\|\|\s*!pinForm\.regionKey\s*\}/.test(
        src,
      ),
    ).toBe(true);
  });

  it("pins table has a per-row remove button calling removePinMutation", () => {
    const src = readFileSync(file, "utf8");
    expect(
      /removePinMutation\.mutate\(\{\s*\n?\s*workspaceId:\s*p\.workspaceId/.test(
        src,
      ),
    ).toBe(true);
  });
});
