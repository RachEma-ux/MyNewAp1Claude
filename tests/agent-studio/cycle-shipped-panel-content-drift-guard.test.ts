/**
 * Cycle-shipped panel content drift guard (post no-deferral cycle close 2026-05-20).
 *
 * For each admin panel shipped by the partial-consumer audit cycle
 * (cont-23 → cont-39), this test asserts the panel still calls the
 * expected tRPC namespace + endpoint. Catches the failure mode where
 * a router gets renamed and the panel silently 404s at runtime
 * (the same drift class that PRs #1434 / #1435 closed for top-level
 * mounts — this is the per-panel sister).
 *
 * Sister of `agent-studio-router-mount-drift-guard.test.ts` (which
 * asserts every server router is mounted) and the per-arc
 * nav-surface lockstep tests (which assert the page→view wiring).
 * This file fills the gap between them: panel→tRPC binding.
 *
 * Each row is `[panelFile, namespace, oneEndpoint]`. The endpoint
 * is one specific procedure the panel must call — chosen as the
 * "anchor" endpoint that defines the panel's reason for existing.
 * If a panel stops calling its anchor, this test fails loud.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");

interface PanelExpectation {
  panel: string;
  namespace: string;
  anchorEndpoint: string;
}

const EXPECTATIONS: PanelExpectation[] = [
  {
    panel: "PromotionLifecyclePanel.tsx",
    namespace: "promotion",
    anchorEndpoint: "submit",
  },
  {
    panel: "GraphCorrectionPanel.tsx",
    namespace: "graphCorrection",
    anchorEndpoint: "list",
  },
  {
    panel: "SemanticEnrichmentPanel.tsx",
    namespace: "semanticEnrichment",
    anchorEndpoint: "listProposals",
  },
  {
    panel: "GraphQualityPanel.tsx",
    namespace: "graphQuality",
    anchorEndpoint: "getOperatorDashboard",
  },
  {
    panel: "VaultAdminPanel.tsx",
    namespace: "vault",
    anchorEndpoint: "addMember",
  },
  {
    panel: "WorkspaceObservabilityPanel.tsx",
    namespace: "workspaceObservability",
    anchorEndpoint: "listMyNotifications",
  },
  {
    panel: "ProviderBindingsAdminPanel.tsx",
    namespace: "providerBindings",
    anchorEndpoint: "listForAgent",
  },
  {
    panel: "CanvasAdminPanel.tsx",
    namespace: "canvas",
    anchorEndpoint: "get",
  },
  {
    panel: "GraphAgentAdminPanel.tsx",
    namespace: "graphAgent",
    anchorEndpoint: "health",
  },
  {
    panel: "GraphSkillAdminPanel.tsx",
    namespace: "graphSkill",
    anchorEndpoint: "listPackVersions",
  },
  {
    panel: "CagAdminPanel.tsx",
    namespace: "cag",
    anchorEndpoint: "listPacks",
  },
  {
    panel: "GraphProjectionDrainPanel.tsx",
    namespace: "graphProjection",
    anchorEndpoint: "getDrainCronStatus",
  },
  {
    panel: "RacEvaluateTracePanel.tsx",
    namespace: "racEvaluation",
    anchorEndpoint: "evaluate",
  },
  {
    panel: "ToolApprovalsLookupPanel.tsx",
    namespace: "toolApprovals",
    anchorEndpoint: "list",
  },
  {
    panel: "ToolKnowledgeDetailPanel.tsx",
    namespace: "toolKnowledge",
    anchorEndpoint: "getTool",
  },
  {
    panel: "GraphWorkspaceUtilsPanel.tsx",
    namespace: "graphWorkspace",
    anchorEndpoint: "backendHealth",
  },
];

describe("cycle-shipped panel content drift guard", () => {
  for (const exp of EXPECTATIONS) {
    describe(exp.panel, () => {
      const path = join(
        REPO_ROOT,
        "client/src/modules/agent-studio/components",
        exp.panel,
      );

      it("file exists", () => {
        expect(existsSync(path)).toBe(true);
      });

      it(`calls trpc.agentStudio.${exp.namespace}.${exp.anchorEndpoint}`, () => {
        const src = readFileSync(path, "utf8");
        const pattern = new RegExp(
          `trpc\\.agentStudio\\.${exp.namespace}\\.${exp.anchorEndpoint}\\.(useQuery|useMutation)`,
        );
        expect(pattern.test(src)).toBe(true);
      });
    });
  }
});
