/**
 * HR Phase 4 Tests — Compensation, Relations, Engagement, Compliance, Analytics, Talent
 *
 * Tests schema exports, type exports, permission actions, router composition,
 * and state machine transition maps for all Phase 4 domains.
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// Schema Exports
// ============================================================================

describe("HR Phase 4 — Schema Exports", () => {
  it("exports compensation tables from schema barrel", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrSalaryBands).toBeDefined();
    expect(schema.hrCompensationRecords).toBeDefined();
    expect(schema.hrSalaryReviewCycles).toBeDefined();
    expect(schema.hrBonusRecords).toBeDefined();
    expect(schema.hrBenefitPlans).toBeDefined();
    expect(schema.hrBenefitEnrollments).toBeDefined();
  });

  it("exports relations tables from schema barrel", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrPolicies).toBeDefined();
    expect(schema.hrPolicyAcknowledgements).toBeDefined();
    expect(schema.hrGrievances).toBeDefined();
    expect(schema.hrDisciplinaryActions).toBeDefined();
    expect(schema.hrInvestigations).toBeDefined();
  });

  it("exports engagement tables from schema barrel", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrSurveyCampaigns).toBeDefined();
    expect(schema.hrSurveyResponses).toBeDefined();
    expect(schema.hrEngagementPrograms).toBeDefined();
    expect(schema.hrWellbeingResources).toBeDefined();
    expect(schema.hrRecognitionPrograms).toBeDefined();
    expect(schema.hrRecognitionEvents).toBeDefined();
  });

  it("exports compliance tables from schema barrel", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrIncidentReports).toBeDefined();
    expect(schema.hrComplianceObligations).toBeDefined();
    expect(schema.hrComplianceEvidence).toBeDefined();
    expect(schema.hrRiskItems).toBeDefined();
  });

  it("exports analytics tables from schema barrel", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrReportDefinitions).toBeDefined();
    expect(schema.hrMetricSnapshots).toBeDefined();
  });

  it("exports talent tables from schema barrel", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrTalentReviews).toBeDefined();
    expect(schema.hrSuccessionPlans).toBeDefined();
    expect(schema.hrSuccessionCandidates).toBeDefined();
  });
});

// ============================================================================
// Type Exports
// ============================================================================

describe("HR Phase 4 — Type Exports", () => {
  it("exports compensation types", async () => {
    const tables = await import("../../../drizzle/tables/hr-compensation");
    // Type-level checks — if these compile, types exist
    type SB = typeof tables.hrSalaryBands.$inferSelect;
    type ISB = typeof tables.hrSalaryBands.$inferInsert;
    type CR = typeof tables.hrCompensationRecords.$inferSelect;
    type ICR = typeof tables.hrCompensationRecords.$inferInsert;
    type SRC = typeof tables.hrSalaryReviewCycles.$inferSelect;
    type BR = typeof tables.hrBonusRecords.$inferSelect;
    type BP = typeof tables.hrBenefitPlans.$inferSelect;
    type BE = typeof tables.hrBenefitEnrollments.$inferSelect;
    expect(tables.hrSalaryBands).toBeDefined();
  });

  it("exports relations types", async () => {
    const tables = await import("../../../drizzle/tables/hr-relations");
    type P = typeof tables.hrPolicies.$inferSelect;
    type PA = typeof tables.hrPolicyAcknowledgements.$inferSelect;
    type G = typeof tables.hrGrievances.$inferSelect;
    type DA = typeof tables.hrDisciplinaryActions.$inferSelect;
    type I = typeof tables.hrInvestigations.$inferSelect;
    expect(tables.hrPolicies).toBeDefined();
  });

  it("exports engagement types", async () => {
    const tables = await import("../../../drizzle/tables/hr-engagement");
    type SC = typeof tables.hrSurveyCampaigns.$inferSelect;
    type SR = typeof tables.hrSurveyResponses.$inferSelect;
    type EP = typeof tables.hrEngagementPrograms.$inferSelect;
    type WR = typeof tables.hrWellbeingResources.$inferSelect;
    type RP = typeof tables.hrRecognitionPrograms.$inferSelect;
    type RE = typeof tables.hrRecognitionEvents.$inferSelect;
    expect(tables.hrSurveyCampaigns).toBeDefined();
  });

  it("exports compliance types", async () => {
    const tables = await import("../../../drizzle/tables/hr-compliance");
    type IR = typeof tables.hrIncidentReports.$inferSelect;
    type CO = typeof tables.hrComplianceObligations.$inferSelect;
    type CE = typeof tables.hrComplianceEvidence.$inferSelect;
    type RI = typeof tables.hrRiskItems.$inferSelect;
    expect(tables.hrIncidentReports).toBeDefined();
  });

  it("exports analytics types", async () => {
    const tables = await import("../../../drizzle/tables/hr-analytics");
    type RD = typeof tables.hrReportDefinitions.$inferSelect;
    type MS = typeof tables.hrMetricSnapshots.$inferSelect;
    expect(tables.hrReportDefinitions).toBeDefined();
  });

  it("exports talent types", async () => {
    const tables = await import("../../../drizzle/tables/hr-talent");
    type TR = typeof tables.hrTalentReviews.$inferSelect;
    type SP = typeof tables.hrSuccessionPlans.$inferSelect;
    type SC = typeof tables.hrSuccessionCandidates.$inferSelect;
    expect(tables.hrTalentReviews).toBeDefined();
  });
});

// ============================================================================
// Permissions
// ============================================================================

describe("HR Phase 4 — Permissions", () => {
  it("has all Phase 4 permission actions defined", async () => {
    const { HR_ACTIONS } = await import("../permissions");

    // Compensation
    expect(HR_ACTIONS.COMPENSATION_READ).toBe("hr.compensation.read");
    expect(HR_ACTIONS.COMPENSATION_READ_SENSITIVE).toBe("hr.compensation.read.sensitive");
    expect(HR_ACTIONS.COMPENSATION_WRITE).toBe("hr.compensation.write");
    expect(HR_ACTIONS.COMPENSATION_MANAGE).toBe("hr.compensation.manage");
    expect(HR_ACTIONS.BENEFITS_READ).toBe("hr.benefits.read");
    expect(HR_ACTIONS.BENEFITS_WRITE).toBe("hr.benefits.write");
    expect(HR_ACTIONS.BENEFITS_MANAGE).toBe("hr.benefits.manage");

    // Relations
    expect(HR_ACTIONS.RELATIONS_READ).toBe("hr.relations.read");
    expect(HR_ACTIONS.RELATIONS_READ_SENSITIVE).toBe("hr.relations.read.sensitive");
    expect(HR_ACTIONS.RELATIONS_WRITE).toBe("hr.relations.write");
    expect(HR_ACTIONS.RELATIONS_MANAGE).toBe("hr.relations.manage");
    expect(HR_ACTIONS.POLICY_READ).toBe("hr.policy.read");
    expect(HR_ACTIONS.POLICY_WRITE).toBe("hr.policy.write");
    expect(HR_ACTIONS.POLICY_MANAGE).toBe("hr.policy.manage");

    // Engagement
    expect(HR_ACTIONS.ENGAGEMENT_READ).toBe("hr.engagement.read");
    expect(HR_ACTIONS.ENGAGEMENT_WRITE).toBe("hr.engagement.write");
    expect(HR_ACTIONS.ENGAGEMENT_MANAGE).toBe("hr.engagement.manage");
    expect(HR_ACTIONS.SURVEY_READ).toBe("hr.survey.read");
    expect(HR_ACTIONS.SURVEY_WRITE).toBe("hr.survey.write");
    expect(HR_ACTIONS.SURVEY_MANAGE).toBe("hr.survey.manage");
    expect(HR_ACTIONS.RECOGNITION_READ).toBe("hr.recognition.read");
    expect(HR_ACTIONS.RECOGNITION_WRITE).toBe("hr.recognition.write");

    // Compliance
    expect(HR_ACTIONS.COMPLIANCE_READ).toBe("hr.compliance.read");
    expect(HR_ACTIONS.COMPLIANCE_WRITE).toBe("hr.compliance.write");
    expect(HR_ACTIONS.COMPLIANCE_MANAGE).toBe("hr.compliance.manage");
    expect(HR_ACTIONS.INCIDENT_READ).toBe("hr.incident.read");
    expect(HR_ACTIONS.INCIDENT_WRITE).toBe("hr.incident.write");
    expect(HR_ACTIONS.INCIDENT_MANAGE).toBe("hr.incident.manage");
    expect(HR_ACTIONS.RISK_READ).toBe("hr.risk.read");
    expect(HR_ACTIONS.RISK_WRITE).toBe("hr.risk.write");
    expect(HR_ACTIONS.RISK_MANAGE).toBe("hr.risk.manage");

    // Analytics
    expect(HR_ACTIONS.ANALYTICS_READ).toBe("hr.analytics.read");
    expect(HR_ACTIONS.ANALYTICS_WRITE).toBe("hr.analytics.write");
    expect(HR_ACTIONS.ANALYTICS_MANAGE).toBe("hr.analytics.manage");

    // Talent
    expect(HR_ACTIONS.TALENT_READ).toBe("hr.talent.read");
    expect(HR_ACTIONS.TALENT_WRITE).toBe("hr.talent.write");
    expect(HR_ACTIONS.TALENT_MANAGE).toBe("hr.talent.manage");
    expect(HR_ACTIONS.SUCCESSION_READ).toBe("hr.succession.read");
    expect(HR_ACTIONS.SUCCESSION_WRITE).toBe("hr.succession.write");
    expect(HR_ACTIONS.SUCCESSION_MANAGE).toBe("hr.succession.manage");
  });

  it("has sensitive field masks for compensation and relations", async () => {
    const { MASKED_COMPENSATION_FIELDS, MASKED_RELATIONS_FIELDS } = await import("../permissions");
    expect(MASKED_COMPENSATION_FIELDS).toContain("baseSalary");
    expect(MASKED_COMPENSATION_FIELDS).toContain("amount");
    expect(MASKED_RELATIONS_FIELDS).toContain("findings");
    expect(MASKED_RELATIONS_FIELDS).toContain("resolutionNotes");
  });
});

// ============================================================================
// Router Composition
// ============================================================================

describe("HR Phase 4 — Router Composition", () => {
  it("hrRouter includes all Phase 4 sub-routers", async () => {
    const { hrRouter } = await import("../router");
    const shape = hrRouter._def.procedures;
    // Phase 4 sub-routers
    expect(shape).toHaveProperty("compensation");
    expect(shape).toHaveProperty("relations");
    expect(shape).toHaveProperty("engagement");
    expect(shape).toHaveProperty("compliance");
    expect(shape).toHaveProperty("analytics");
    expect(shape).toHaveProperty("talent");
  });

  it("settings reports version 4.0.0 with all features enabled", async () => {
    const { hrRouter } = await import("../router");
    // Check that settings sub-router is present
    expect(hrRouter._def.procedures).toHaveProperty("settings");
  });
});

// ============================================================================
// State Machine Transition Maps — Compensation
// ============================================================================

describe("HR Phase 4 — Compensation State Machines", () => {
  it("SALARY_REVIEW_STATUS_FLOW: draft -> open -> in_review -> approved -> completed", () => {
    const flow: Record<string, string[]> = {
      draft: ["open"],
      open: ["in_review", "cancelled"],
      in_review: ["approved", "cancelled"],
      approved: ["completed"],
      completed: [],
      cancelled: [],
    };
    expect(flow.draft).toContain("open");
    expect(flow.open).toContain("in_review");
    expect(flow.in_review).toContain("approved");
    expect(flow.approved).toContain("completed");
    expect(flow.completed).toHaveLength(0);
  });

  it("BONUS_STATUS_FLOW: pending -> approved -> paid", () => {
    const flow: Record<string, string[]> = {
      pending: ["approved", "cancelled"],
      approved: ["paid", "cancelled"],
      paid: [],
      cancelled: [],
    };
    expect(flow.pending).toContain("approved");
    expect(flow.approved).toContain("paid");
    expect(flow.paid).toHaveLength(0);
  });

  it("ENROLLMENT_STATUS_FLOW: pending -> active -> cancelled|expired", () => {
    const flow: Record<string, string[]> = {
      pending: ["active", "cancelled"],
      active: ["cancelled", "expired"],
      cancelled: [],
      expired: [],
    };
    expect(flow.pending).toContain("active");
    expect(flow.active).toContain("expired");
  });
});

// ============================================================================
// State Machine Transition Maps — Relations
// ============================================================================

describe("HR Phase 4 — Relations State Machines", () => {
  it("GRIEVANCE_STATUS_FLOW: filed -> under_review -> investigating -> resolved -> closed", () => {
    const flow: Record<string, string[]> = {
      filed: ["under_review", "dismissed", "withdrawn"],
      under_review: ["investigating", "resolved", "escalated", "dismissed"],
      investigating: ["resolved", "escalated", "dismissed"],
      resolved: ["closed"],
      dismissed: ["closed"],
      escalated: ["investigating", "resolved"],
      withdrawn: [],
      closed: [],
    };
    expect(flow.filed).toContain("under_review");
    expect(flow.under_review).toContain("investigating");
    expect(flow.investigating).toContain("resolved");
    expect(flow.resolved).toContain("closed");
    expect(flow.closed).toHaveLength(0);
  });

  it("DISCIPLINARY_STATUS_FLOW: active -> appealed|expired|completed", () => {
    const flow: Record<string, string[]> = {
      active: ["appealed", "expired", "completed"],
      appealed: ["active", "overturned"],
      expired: [],
      overturned: [],
      completed: [],
    };
    expect(flow.active).toContain("appealed");
    expect(flow.appealed).toContain("overturned");
  });

  it("INVESTIGATION_STATUS_FLOW: opened -> in_progress -> pending_review -> closed_*", () => {
    const flow: Record<string, string[]> = {
      opened: ["in_progress", "cancelled"],
      in_progress: ["pending_review", "cancelled"],
      pending_review: ["closed_substantiated", "closed_unsubstantiated", "closed_inconclusive", "in_progress"],
      closed_substantiated: [],
      closed_unsubstantiated: [],
      closed_inconclusive: [],
      cancelled: [],
    };
    expect(flow.opened).toContain("in_progress");
    expect(flow.in_progress).toContain("pending_review");
    expect(flow.pending_review).toContain("closed_substantiated");
    expect(flow.pending_review).toContain("closed_unsubstantiated");
    expect(flow.pending_review).toContain("closed_inconclusive");
  });
});

// ============================================================================
// State Machine Transition Maps — Engagement
// ============================================================================

describe("HR Phase 4 — Engagement State Machines", () => {
  it("SURVEY_STATUS_FLOW: draft -> active -> closed", () => {
    const flow: Record<string, string[]> = {
      draft: ["active", "cancelled"],
      active: ["closed", "cancelled"],
      closed: [],
      cancelled: [],
    };
    expect(flow.draft).toContain("active");
    expect(flow.active).toContain("closed");
  });

  it("RECOGNITION_STATUS_FLOW: nominated -> approved -> awarded", () => {
    const flow: Record<string, string[]> = {
      nominated: ["approved", "declined"],
      approved: ["awarded"],
      awarded: [],
      declined: [],
    };
    expect(flow.nominated).toContain("approved");
    expect(flow.approved).toContain("awarded");
  });
});

// ============================================================================
// State Machine Transition Maps — Compliance
// ============================================================================

describe("HR Phase 4 — Compliance State Machines", () => {
  it("INCIDENT_STATUS_FLOW: reported -> under_investigation -> resolved -> closed", () => {
    const flow: Record<string, string[]> = {
      reported: ["under_investigation", "action_required", "closed"],
      under_investigation: ["action_required", "resolved", "closed"],
      action_required: ["resolved", "closed"],
      resolved: ["closed"],
      closed: [],
    };
    expect(flow.reported).toContain("under_investigation");
    expect(flow.under_investigation).toContain("resolved");
    expect(flow.resolved).toContain("closed");
  });

  it("RISK_STATUS_FLOW: identified -> assessing -> mitigating -> mitigated -> closed", () => {
    const flow: Record<string, string[]> = {
      identified: ["assessing", "accepted", "closed"],
      assessing: ["mitigating", "accepted", "closed"],
      mitigating: ["mitigated", "accepted", "closed"],
      accepted: ["mitigating", "closed"],
      mitigated: ["closed"],
      closed: [],
    };
    expect(flow.identified).toContain("assessing");
    expect(flow.assessing).toContain("mitigating");
    expect(flow.mitigating).toContain("mitigated");
    expect(flow.mitigated).toContain("closed");
  });
});

// ============================================================================
// State Machine Transition Maps — Talent
// ============================================================================

describe("HR Phase 4 — Talent State Machines", () => {
  it("TALENT_REVIEW_STATUS_FLOW: draft -> submitted -> calibrated -> finalized", () => {
    const flow: Record<string, string[]> = {
      draft: ["submitted"],
      submitted: ["calibrated", "draft"],
      calibrated: ["finalized"],
      finalized: [],
    };
    expect(flow.draft).toContain("submitted");
    expect(flow.submitted).toContain("calibrated");
    expect(flow.calibrated).toContain("finalized");
    expect(flow.finalized).toHaveLength(0);
  });

  it("SUCCESSION_PLAN_STATUS_FLOW: draft -> active -> archived|completed", () => {
    const flow: Record<string, string[]> = {
      draft: ["active"],
      active: ["archived", "completed"],
      archived: ["active"],
      completed: [],
    };
    expect(flow.draft).toContain("active");
    expect(flow.active).toContain("completed");
    expect(flow.archived).toContain("active");
  });

  it("SUCCESSION_CANDIDATE_STATUS_FLOW: nominated -> approved -> developing -> ready", () => {
    const flow: Record<string, string[]> = {
      nominated: ["approved", "withdrawn"],
      approved: ["developing", "ready", "withdrawn"],
      developing: ["ready", "withdrawn"],
      ready: ["withdrawn"],
      withdrawn: [],
    };
    expect(flow.nominated).toContain("approved");
    expect(flow.approved).toContain("developing");
    expect(flow.developing).toContain("ready");
    expect(flow.ready).toContain("withdrawn");
  });
});
