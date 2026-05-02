import { describe, expect, it } from "vitest";
import {
  detectCrossModuleImport,
  isModuleFile,
  resolveSelfModule,
  scanFileForBoundaries,
} from "../../scripts/module-tools/boundary-rules";

describe("resolveSelfModule", () => {
  it("derives RTLM key from module path", () => {
    expect(resolveSelfModule("client/src/modules/communication/pages/Chat.tsx")).toBe(
      "communication",
    );
    expect(resolveSelfModule("client/src/modules/data-analysis/manifest.ts")).toBe(
      "dataAnalysis",
    );
  });
  it("returns null outside any module", () => {
    expect(resolveSelfModule("client/src/components/Button.tsx")).toBe(null);
  });
});

describe("isModuleFile", () => {
  it("identifies module-folder files", () => {
    expect(isModuleFile("client/src/modules/hr/x.ts")).toBe(true);
    expect(isModuleFile("client/src/components/x.ts")).toBe(false);
  });
});

describe("detectCrossModuleImport", () => {
  it("flags @/modules/<other>/pages as private", () => {
    expect(
      detectCrossModuleImport("@/modules/communication/pages/Chat", "dataAnalysis"),
    ).toEqual({ kind: "private-import", foreignModule: "communication" });
  });
  it("allows @/modules/<other> public index", () => {
    expect(
      detectCrossModuleImport("@/modules/communication", "dataAnalysis"),
    ).toBe(null);
    expect(
      detectCrossModuleImport("@/modules/communication/index", "dataAnalysis"),
    ).toBe(null);
  });
  it("ignores same-module imports", () => {
    expect(
      detectCrossModuleImport("@/modules/communication/pages/Chat", "communication"),
    ).toBe(null);
  });
  it("flags relative climbs into another module", () => {
    expect(
      detectCrossModuleImport("../../communication/pages/Chat", "dataAnalysis"),
    ).toEqual({ kind: "private-import", foreignModule: "communication" });
  });
});

describe("scanFileForBoundaries", () => {
  it("flags MainLayout import inside a module", () => {
    const findings = scanFileForBoundaries(
      "client/src/modules/communication/mod.tsx",
      `import { MainLayout } from "@/components/MainLayout";`,
    );
    expect(findings.some((f) => f.kind === "main-layout-import")).toBe(true);
  });
  it("does not flag MainLayout outside modules", () => {
    const findings = scanFileForBoundaries(
      "client/src/App.tsx",
      `import { MainLayout } from "@/components/MainLayout";`,
    );
    expect(findings).toEqual([]);
  });
  it("flags trpc.<other> calls from inside a module", () => {
    const findings = scanFileForBoundaries(
      "client/src/modules/communication/foo.ts",
      `const data = trpc.dataAnalysis.something.useQuery();`,
    );
    expect(findings.some((f) => f.kind === "cross-module-trpc")).toBe(true);
  });
  it("does not flag own-module trpc", () => {
    const findings = scanFileForBoundaries(
      "client/src/modules/communication/foo.ts",
      `const data = trpc.communication.send.useMutation();`,
    );
    expect(findings.some((f) => f.kind === "cross-module-trpc")).toBe(false);
  });
});
