import { describe, expect, it } from "vitest";
import { scanFileContent } from "../../scripts/governance/check-llm-governance-invariants";

describe("check-llm-governance-invariants", () => {
  it("passes a clean critical mutation sample", () => {
    const source = [
      'export async function createLLM() {',
      '  await requiredLLMAuditEvent(tx, { eventType: "llm.created" });',
      '}',
      'export async function updateLLM() {',
      '  await requiredLLMAuditEvent(tx, { eventType: "llm.updated" });',
      '}',
      'export async function archiveLLM() {',
      '  await requiredLLMAuditEvent(tx, { eventType: "llm.archived" });',
      '}',
      'export async function createLLMVersion() {',
      '  await requiredLLMAuditEvent(tx, { eventType: "llm.version.created" });',
      '}',
      'export async function updateLLMVersionCallable() {',
      '  await requiredLLMAuditEvent(tx, { eventType: "llm.version.catalog_eligibility_enabled" });',
      '}',
      'export async function createPromotion() {',
      '  await requiredLLMAuditEvent(tx, { eventType: "llm.promotion.requested" });',
      '}',
      'export async function approvePromotion() {',
      '  await requiredLLMAuditEvent(tx, { eventType: "llm.promotion.approved" });',
      '}',
      'export async function rejectPromotion() {',
      '  await requiredLLMAuditEvent(tx, { eventType: "llm.promotion.rejected" });',
      '}',
      'export async function executePromotion() {',
      '  await requiredLLMAuditEvent(tx, { eventType: "llm.promotion.executed" });',
      '}',
    ].join("\n");

    expect(scanFileContent("server/db/llms.ts", source)).toEqual([]);
  });

  it("detects hardcoded principal placeholders", () => {
    const violations = scanFileContent(
      "server/routers/llm.ts",
      'return { actor: 0, success: true };'
    );

    expect(violations.some((violation) => violation.rule === "hardcoded-principal")).toBe(true);
  });

  it("detects soft denials in governed mutation paths", () => {
    const violations = scanFileContent(
      "server/routers/llm.ts",
      'return { success: false, message: "no" };'
    );

    expect(violations.some((violation) => violation.rule === "soft-denial")).toBe(true);
  });

  it("detects missing required audit coverage", () => {
    const source = [
      'export async function createLLM() { return {}; }',
      'export async function updateLLM() { return {}; }',
      'export async function archiveLLM() { return {}; }',
      'export async function createLLMVersion() { return {}; }',
      'export async function updateLLMVersionCallable() { return {}; }',
      'export async function createPromotion() { return {}; }',
      'export async function approvePromotion() { return {}; }',
      'export async function rejectPromotion() { return {}; }',
      'export async function executePromotion() { return {}; }',
    ].join("\n");

    const violations = scanFileContent("server/db/llms.ts", source);
    expect(violations.filter((violation) => violation.rule === "missing-required-audit")).toHaveLength(9);
  });

  it("passes clean authority onboarding sample", () => {
    const source = [
      'export async function onboardLLMVersionToCatalogCandidate() {',
      '  await tx.insert(catalogAuditEvents).values({ eventType: "catalog.llm.onboarded" });',
      '}',
    ].join("\n");

    expect(scanFileContent("server/llm/authority.ts", source)).toEqual([]);
  });

  it("detects fire-and-forget audit in authority onboarding", () => {
    const source = [
      'export async function onboardLLMVersionToCatalogCandidate() {',
      '  await tx.insert(catalogAuditEvents).values({}).catch(() => {});',
      '}',
    ].join("\n");

    const violations = scanFileContent("server/llm/authority.ts", source);
    expect(violations.some((v) => v.rule === "fire-and-forget-audit")).toBe(true);
  });

  it("passes clean project-output-registration sample", () => {
    const source = [
      'export async function registerProjectOutputAsLLMVersionCandidate() {',
      '  const version = await createLLMVersionWithExecutor(tx, data);',
      '  await tx.insert(llmCreationAuditEvents).values({ eventType: "project.output.registered" });',
      '}',
    ].join("\n");

    expect(scanFileContent("server/llm/project-output-registration.ts", source)).toEqual([]);
  });

  it("detects missing audit in project-output-registration", () => {
    const source = [
      'export async function registerProjectOutputAsLLMVersionCandidate() {',
      '  return {};',
      '}',
    ].join("\n");

    const violations = scanFileContent("server/llm/project-output-registration.ts", source);
    expect(violations.some((v) => v.rule === "missing-required-audit")).toBe(true);
  });
});
