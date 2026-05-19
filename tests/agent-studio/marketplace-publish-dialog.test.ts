/**
 * AgentMarketplacePage Publish dialog — source-scan integrity.
 *
 * Slice 21 of the no-deferral catalogue (2026-05-19). Closes the
 * "deferred to a follow-up — UI-side; backend already exists" note
 * at the page's doc-block.
 *
 * Locks the publish-dialog wiring (open/close state, form fields,
 * tRPC mutation call shape, payload JSON parsing) so a future
 * refactor can't accidentally regress to the deferred shape.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const PAGE_PATH = join(
  process.cwd(),
  "client/src/modules/agent-studio/pages/AgentMarketplacePage.tsx",
);

describe("AgentMarketplacePage — Publish dialog (slice 21)", () => {
  const src = readFileSync(PAGE_PATH, "utf8");

  it("doc-block no longer carries the 'deferred to a follow-up — UI-side' marker", () => {
    expect(src).not.toMatch(
      /deferred to a follow-up — UI-side;\s*backend already exists\)\n \*\//,
    );
    // The slice 21 close-out doc-block names the closure.
    expect(src).toMatch(/no-deferral slice 21/);
  });

  it("imports Dialog primitives from @/components/ui/dialog", () => {
    expect(src).toMatch(
      /import\s+\{[^}]*\bDialog\b[^}]*\bDialogContent\b[^}]*\}\s+from\s+["']@\/components\/ui\/dialog["']/s,
    );
  });

  it("renders a Publish button in the page header", () => {
    expect(src).toMatch(/data-testid="marketplace-publish-button"/);
  });

  it("renders the publish Dialog with the documented test seam", () => {
    expect(src).toMatch(/data-testid="marketplace-publish-dialog"/);
  });

  it("includes form fields for every publishMarketplaceItemSchema property", () => {
    expect(src).toMatch(/data-testid="publish-item-key"/);
    expect(src).toMatch(/data-testid="publish-item-type"/);
    expect(src).toMatch(/data-testid="publish-display-name"/);
    expect(src).toMatch(/data-testid="publish-description"/);
    expect(src).toMatch(/data-testid="publish-author"/);
    expect(src).toMatch(/data-testid="publish-version"/);
    expect(src).toMatch(/data-testid="publish-tags"/);
    expect(src).toMatch(/data-testid="publish-payload"/);
  });

  it("exposes the 5 valid item-type enum values in the select", () => {
    expect(src).toMatch(/<option value="skill">/);
    expect(src).toMatch(/<option value="skill_pack">/);
    expect(src).toMatch(/<option value="tool">/);
    expect(src).toMatch(/<option value="tool_pack">/);
    expect(src).toMatch(/<option value="bundle">/);
  });

  it("calls agentStudio.marketplace.publish.useMutation", () => {
    expect(src).toMatch(
      /trpc\.agentStudio\.marketplace\.publish\.useMutation\(/,
    );
  });

  it("parses payload JSON + rejects non-object payloads explicitly", () => {
    expect(src).toMatch(/JSON\.parse\(publishForm\.payloadJson\)/);
    expect(src).toMatch(/payload must be a JSON object/);
    expect(src).toMatch(/data-testid="publish-payload-error"/);
  });

  it("invalidates the marketplace list on publish success", () => {
    expect(src).toMatch(
      /utils\.agentStudio\.marketplace\.list\.invalidate\(\)/,
    );
  });

  it("disables the submit button on missing required fields", () => {
    expect(src).toMatch(/!publishForm\.itemKey\.trim\(\)/);
    expect(src).toMatch(/!publishForm\.displayName\.trim\(\)/);
    expect(src).toMatch(/!publishForm\.version\.trim\(\)/);
  });
});
