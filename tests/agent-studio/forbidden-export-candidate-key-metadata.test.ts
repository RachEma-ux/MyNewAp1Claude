/**
 * Phase E §T-E.6 — Forbidden export-candidate key metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  FORBIDDEN_EXPORT_CANDIDATE_KEYS,
  FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA,
  getForbiddenExportCandidateKeyMetadata,
} from "../../server/agent-studio/shared/export-candidate.js";

const VALID_LEAK_CLASSES = [
  "agent_studio_internal",
  "release_internal",
  "draft_internal",
  "env_handoff",
] as const;

const EXPECTED_CREDENTIAL_DIRECT_KEYS = new Set([
  "providerConfig",
  "apiKey",
  "secret",
  "secrets",
  "credentials",
  "bearerToken",
]);

describe("FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA (T-E.6)", () => {
  it("has metadata for every closed-taxonomy forbidden key", () => {
    for (const k of FORBIDDEN_EXPORT_CANDIDATE_KEYS) {
      expect(FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(
      Object.keys(FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA).length,
    ).toBe(FORBIDDEN_EXPORT_CANDIDATE_KEYS.length);
  });

  it.each(FORBIDDEN_EXPORT_CANDIDATE_KEYS)(
    "%s has non-empty label + description + valid leakClass + boolean isCredentialDirect",
    (k) => {
      const md = FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA[k];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(VALID_LEAK_CLASSES).toContain(md.leakClass);
      expect(typeof md.isCredentialDirect).toBe("boolean");
    },
  );

  it.each(FORBIDDEN_EXPORT_CANDIDATE_KEYS)(
    "getForbiddenExportCandidateKeyMetadata(%s) returns table entry",
    (k) => {
      expect(getForbiddenExportCandidateKeyMetadata(k)).toBe(
        FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA[k],
      );
    },
  );

  it("agent_studio_internal leakClass covers exactly the 6 documented keys", () => {
    const actual = new Set(
      FORBIDDEN_EXPORT_CANDIDATE_KEYS.filter(
        (k) =>
          FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA[k].leakClass ===
          "agent_studio_internal",
      ),
    );
    expect(actual).toEqual(
      new Set([
        "providerConfig",
        "apiKey",
        "secret",
        "secrets",
        "credentials",
        "bearerToken",
      ]),
    );
  });

  it("release_internal leakClass covers exactly releaseNotes + approvalStateJson", () => {
    const actual = new Set(
      FORBIDDEN_EXPORT_CANDIDATE_KEYS.filter(
        (k) =>
          FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA[k].leakClass ===
          "release_internal",
      ),
    );
    expect(actual).toEqual(new Set(["releaseNotes", "approvalStateJson"]));
  });

  it("draft_internal leakClass covers exactly systemInstructions + roleInstructions", () => {
    const actual = new Set(
      FORBIDDEN_EXPORT_CANDIDATE_KEYS.filter(
        (k) =>
          FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA[k].leakClass ===
          "draft_internal",
      ),
    );
    expect(actual).toEqual(new Set(["systemInstructions", "roleInstructions"]));
  });

  it("env_handoff leakClass covers exactly apiKeyEnvVar + envVar + env + process", () => {
    const actual = new Set(
      FORBIDDEN_EXPORT_CANDIDATE_KEYS.filter(
        (k) =>
          FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA[k].leakClass ===
          "env_handoff",
      ),
    );
    expect(actual).toEqual(
      new Set(["apiKeyEnvVar", "envVar", "env", "process"]),
    );
  });

  it("isCredentialDirect is true exactly for the 6 documented credential-name keys", () => {
    const actual = new Set(
      FORBIDDEN_EXPORT_CANDIDATE_KEYS.filter(
        (k) => FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA[k].isCredentialDirect,
      ),
    );
    expect(actual).toEqual(EXPECTED_CREDENTIAL_DIRECT_KEYS);
  });

  it("every credentialDirect key has leakClass === agent_studio_internal", () => {
    for (const k of FORBIDDEN_EXPORT_CANDIDATE_KEYS) {
      const md = FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA[k];
      if (md.isCredentialDirect) {
        expect(md.leakClass).toBe("agent_studio_internal");
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const k of FORBIDDEN_EXPORT_CANDIDATE_KEYS) {
      labels.add(FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA[k].label);
    }
    expect(labels.size).toBe(FORBIDDEN_EXPORT_CANDIDATE_KEYS.length);
  });
});
