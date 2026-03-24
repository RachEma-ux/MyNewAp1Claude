/**
 * HR Compliance Tables
 *
 * Incident reports, compliance obligations, evidence/audit records,
 * access-control reviews, and HR risk register.
 */

import {
  serial, varchar, text, integer, boolean, timestamp, date,
  json, pgTable, index,
} from "drizzle-orm/pg-core";
import { hrWorkerProfiles } from "./hr-core";

// ============================================================================
// Incident Reports — Workplace incident tracking
// ============================================================================

export const hrIncidentReports = pgTable("hr_incident_reports", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 100 }).notNull(), // safety | injury | near_miss | environmental | security | data_breach | policy_violation | other
  severity: varchar("severity", { length: 30 }).default("medium").notNull(), // low | medium | high | critical
  incidentDate: date("incident_date").notNull(),
  location: varchar("location", { length: 300 }),
  reportedByWorkerId: integer("reported_by_worker_id").references(() => hrWorkerProfiles.id),
  affectedWorkerId: integer("affected_worker_id").references(() => hrWorkerProfiles.id),
  assignedToId: integer("assigned_to_id").references(() => hrWorkerProfiles.id),
  rootCause: text("root_cause"),
  correctiveAction: text("corrective_action"),
  status: varchar("status", { length: 30 }).default("reported").notNull(), // reported | under_investigation | action_required | resolved | closed
  resolvedAt: timestamp("resolved_at"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("hr_incident_status_idx").on(table.status),
  severityIdx: index("hr_incident_severity_idx").on(table.severity),
  categoryIdx: index("hr_incident_category_idx").on(table.category),
  dateIdx: index("hr_incident_date_idx").on(table.incidentDate),
}));

export type HrIncidentReport = typeof hrIncidentReports.$inferSelect;
export type InsertHrIncidentReport = typeof hrIncidentReports.$inferInsert;

// ============================================================================
// Compliance Obligations — Regulatory and internal requirements
// ============================================================================

export const hrComplianceObligations = pgTable("hr_compliance_obligations", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // labor_law | data_privacy | safety | tax | reporting | internal_policy
  regulation: varchar("regulation", { length: 200 }),
  dueDate: date("due_date"),
  recurringMonths: integer("recurring_months"),
  ownerId: integer("owner_id").references(() => hrWorkerProfiles.id),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | compliant | non_compliant | under_review | waived | expired
  lastReviewedAt: timestamp("last_reviewed_at"),
  nextReviewDate: date("next_review_date"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("hr_compliance_obl_status_idx").on(table.status),
  categoryIdx: index("hr_compliance_obl_cat_idx").on(table.category),
  dueDateIdx: index("hr_compliance_obl_due_idx").on(table.dueDate),
}));

export type HrComplianceObligation = typeof hrComplianceObligations.$inferSelect;
export type InsertHrComplianceObligation = typeof hrComplianceObligations.$inferInsert;

// ============================================================================
// Compliance Evidence — Audit trail and supporting records
// ============================================================================

export const hrComplianceEvidence = pgTable("hr_compliance_evidence", {
  id: serial("id").primaryKey(),
  obligationId: integer("obligation_id").references(() => hrComplianceObligations.id),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  evidenceType: varchar("evidence_type", { length: 50 }), // document | screenshot | report | attestation | other
  documentRef: varchar("document_ref", { length: 500 }),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  recordedBy: integer("recorded_by").references(() => hrWorkerProfiles.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  obligationIdx: index("hr_compliance_ev_obl_idx").on(table.obligationId),
}));

export type HrComplianceEvidenceRecord = typeof hrComplianceEvidence.$inferSelect;
export type InsertHrComplianceEvidenceRecord = typeof hrComplianceEvidence.$inferInsert;

// ============================================================================
// HR Risk Register — Risk items and mitigations
// ============================================================================

export const hrRiskItems = pgTable("hr_risk_items", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // compliance | safety | retention | reputation | operational | legal | financial
  likelihood: varchar("likelihood", { length: 30 }).default("medium").notNull(), // low | medium | high | very_high
  impact: varchar("impact", { length: 30 }).default("medium").notNull(), // low | medium | high | critical
  riskScore: integer("risk_score"), // computed: likelihood * impact
  ownerId: integer("owner_id").references(() => hrWorkerProfiles.id),
  mitigationPlan: text("mitigation_plan"),
  mitigationDueDate: date("mitigation_due_date"),
  status: varchar("status", { length: 30 }).default("identified").notNull(), // identified | assessing | mitigating | accepted | mitigated | closed
  reviewDate: date("review_date"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("hr_risk_status_idx").on(table.status),
  categoryIdx: index("hr_risk_category_idx").on(table.category),
  ownerIdx: index("hr_risk_owner_idx").on(table.ownerId),
}));

export type HrRiskItem = typeof hrRiskItems.$inferSelect;
export type InsertHrRiskItem = typeof hrRiskItems.$inferInsert;

// ============================================================================
// HR Work Permits — Work authorization and permit tracking (Phase 4)
// ============================================================================

export const hrWorkPermits = pgTable("hr_work_permits", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  permitType: varchar("permit_type", { length: 100 }).notNull(), // work_visa | residence_permit | employment_authorization | travel_visa | other
  permitNumber: varchar("permit_number", { length: 200 }),
  issuingCountry: varchar("issuing_country", { length: 100 }),
  issuingAuthority: varchar("issuing_authority", { length: 300 }),
  issueDate: date("issue_date"),
  expiryDate: date("expiry_date"),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | expired | pending_renewal | revoked | cancelled
  notes: text("notes"),
  documentRef: varchar("document_ref", { length: 500 }),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_work_permit_worker_idx").on(table.workerId),
  expiryIdx: index("hr_work_permit_expiry_idx").on(table.expiryDate),
  statusIdx: index("hr_work_permit_status_idx").on(table.status),
  typeIdx: index("hr_work_permit_type_idx").on(table.permitType),
}));

export type HrWorkPermit = typeof hrWorkPermits.$inferSelect;
export type InsertHrWorkPermit = typeof hrWorkPermits.$inferInsert;
