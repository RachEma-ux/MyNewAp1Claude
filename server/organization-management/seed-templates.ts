/**
 * OM Template Seed — Creates 5 built-in organization templates (one per Structure Model)
 *
 * Templates are idempotent: if they already exist (by name), they are skipped.
 * Each template contains a full structural snapshot that the wizard can apply.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/connection";
import { omOrgTemplates } from "../../drizzle/tables/organization-management";

const TEMPLATES = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. FUNCTIONAL — Classic function-based hierarchy
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "Functional Organization",
    structureModel: "functional",
    description:
      "Classic hierarchy organized by business function. Each department (Engineering, Marketing, Finance, HR, Operations) reports to a C-suite executive. Best for companies with stable, specialized functions and clear expertise domains.",
    isSystem: true,
    snapshot: {
      legalEntity: { code: "FUNC-CORP", name: "Functional Corp", type: "company" },
      orgUnits: [
        { code: "EXEC", name: "Executive Office", type: "department" },
        { code: "ENG", name: "Engineering", type: "department", parentIndex: 0 },
        { code: "MKT", name: "Marketing", type: "department", parentIndex: 0 },
        { code: "FIN", name: "Finance", type: "department", parentIndex: 0 },
        { code: "HR", name: "Human Resources", type: "department", parentIndex: 0 },
        { code: "OPS", name: "Operations", type: "department", parentIndex: 0 },
      ],
      jobs: [
        { code: "JOB-CEO", title: "Chief Executive Officer", family: "Executive", level: "C-Suite", levelRank: 100 },
        { code: "JOB-VP", title: "Vice President", family: "Executive", level: "VP", levelRank: 90 },
        { code: "JOB-DIR", title: "Director", family: "Management", level: "Director", levelRank: 80 },
        { code: "JOB-MGR", title: "Manager", family: "Management", level: "Manager", levelRank: 70 },
        { code: "JOB-SR", title: "Senior Specialist", family: "Individual Contributor", level: "Senior", levelRank: 60 },
        { code: "JOB-IC", title: "Specialist", family: "Individual Contributor", level: "Mid", levelRank: 50 },
      ],
      positions: [
        { code: "POS-CEO", title: "CEO", jobIndex: 0, orgUnitIndex: 0 },
        { code: "POS-VP-ENG", title: "VP Engineering", jobIndex: 1, orgUnitIndex: 1 },
        { code: "POS-VP-MKT", title: "VP Marketing", jobIndex: 1, orgUnitIndex: 2 },
        { code: "POS-CFO", title: "Chief Financial Officer", jobIndex: 1, orgUnitIndex: 3 },
        { code: "POS-VP-HR", title: "VP Human Resources", jobIndex: 1, orgUnitIndex: 4 },
        { code: "POS-COO", title: "Chief Operating Officer", jobIndex: 1, orgUnitIndex: 5 },
        { code: "POS-DIR-ENG", title: "Engineering Director", jobIndex: 2, orgUnitIndex: 1 },
        { code: "POS-DIR-MKT", title: "Marketing Director", jobIndex: 2, orgUnitIndex: 2 },
      ],
      reportingLines: [
        { positionIndex: 1, reportsToIndex: 0, type: "direct" }, // VP Eng → CEO
        { positionIndex: 2, reportsToIndex: 0, type: "direct" }, // VP Mkt → CEO
        { positionIndex: 3, reportsToIndex: 0, type: "direct" }, // CFO → CEO
        { positionIndex: 4, reportsToIndex: 0, type: "direct" }, // VP HR → CEO
        { positionIndex: 5, reportsToIndex: 0, type: "direct" }, // COO → CEO
        { positionIndex: 6, reportsToIndex: 1, type: "direct" }, // Eng Dir → VP Eng
        { positionIndex: 7, reportsToIndex: 2, type: "direct" }, // Mkt Dir → VP Mkt
      ],
      costCenters: [
        { code: "CC-EXEC", name: "Executive Office" },
        { code: "CC-ENG", name: "Engineering" },
        { code: "CC-MKT", name: "Marketing" },
        { code: "CC-FIN", name: "Finance" },
        { code: "CC-HR", name: "Human Resources" },
        { code: "CC-OPS", name: "Operations" },
      ],
      governanceNotes:
        "Functional model: decisions flow vertically within each function. Cross-functional decisions require executive alignment.",
      decisionRights:
        "VPs own budget and hiring for their function. Cross-functional initiatives require CEO approval. Directors have operational authority within their unit.",
      escalationPath:
        "IC → Manager → Director → VP → CEO. Cross-functional conflicts escalate to COO then CEO.",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. DIVISIONAL — Product/geography-based divisions
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "Divisional Organization",
    structureModel: "divisional",
    description:
      "Organized by product line or geography. Each division operates semi-autonomously with its own functional teams. Best for diversified companies with distinct product lines or geographic markets.",
    isSystem: true,
    snapshot: {
      legalEntity: { code: "DIV-CORP", name: "Divisional Holdings Inc", type: "holding" },
      orgUnits: [
        { code: "HQ", name: "Corporate Headquarters", type: "department" },
        { code: "DIV-A", name: "Consumer Products Division", type: "division", parentIndex: 0 },
        { code: "DIV-B", name: "Enterprise Solutions Division", type: "division", parentIndex: 0 },
        { code: "DIV-C", name: "International Division", type: "division", parentIndex: 0 },
        { code: "DIV-A-ENG", name: "Consumer Engineering", type: "team", parentIndex: 1 },
        { code: "DIV-A-MKT", name: "Consumer Marketing", type: "team", parentIndex: 1 },
        { code: "DIV-B-ENG", name: "Enterprise Engineering", type: "team", parentIndex: 2 },
        { code: "DIV-B-SALES", name: "Enterprise Sales", type: "team", parentIndex: 2 },
        { code: "DIV-C-EU", name: "Europe Region", type: "business_unit", parentIndex: 3 },
        { code: "DIV-C-APAC", name: "Asia-Pacific Region", type: "business_unit", parentIndex: 3 },
      ],
      jobs: [
        { code: "JOB-CEO", title: "Chief Executive Officer", family: "Executive", level: "C-Suite", levelRank: 100 },
        { code: "JOB-DIVP", title: "Division President", family: "Executive", level: "SVP", levelRank: 95 },
        { code: "JOB-GM", title: "General Manager", family: "Management", level: "GM", levelRank: 85 },
        { code: "JOB-DIR", title: "Director", family: "Management", level: "Director", levelRank: 80 },
        { code: "JOB-MGR", title: "Manager", family: "Management", level: "Manager", levelRank: 70 },
        { code: "JOB-REG-DIR", title: "Regional Director", family: "Management", level: "Director", levelRank: 80 },
      ],
      positions: [
        { code: "POS-CEO", title: "CEO", jobIndex: 0, orgUnitIndex: 0 },
        { code: "POS-PRES-A", title: "President, Consumer Products", jobIndex: 1, orgUnitIndex: 1 },
        { code: "POS-PRES-B", title: "President, Enterprise Solutions", jobIndex: 1, orgUnitIndex: 2 },
        { code: "POS-PRES-C", title: "President, International", jobIndex: 1, orgUnitIndex: 3 },
        { code: "POS-DIR-A-ENG", title: "Director of Consumer Engineering", jobIndex: 3, orgUnitIndex: 4 },
        { code: "POS-DIR-A-MKT", title: "Director of Consumer Marketing", jobIndex: 3, orgUnitIndex: 5 },
        { code: "POS-DIR-B-ENG", title: "Director of Enterprise Engineering", jobIndex: 3, orgUnitIndex: 6 },
        { code: "POS-DIR-B-SALES", title: "Director of Enterprise Sales", jobIndex: 3, orgUnitIndex: 7 },
        { code: "POS-RD-EU", title: "Regional Director, Europe", jobIndex: 5, orgUnitIndex: 8 },
        { code: "POS-RD-APAC", title: "Regional Director, Asia-Pacific", jobIndex: 5, orgUnitIndex: 9 },
      ],
      reportingLines: [
        { positionIndex: 1, reportsToIndex: 0, type: "direct" }, // Pres Consumer → CEO
        { positionIndex: 2, reportsToIndex: 0, type: "direct" }, // Pres Enterprise → CEO
        { positionIndex: 3, reportsToIndex: 0, type: "direct" }, // Pres Intl → CEO
        { positionIndex: 4, reportsToIndex: 1, type: "direct" }, // Consumer Eng Dir → Pres Consumer
        { positionIndex: 5, reportsToIndex: 1, type: "direct" }, // Consumer Mkt Dir → Pres Consumer
        { positionIndex: 6, reportsToIndex: 2, type: "direct" }, // Ent Eng Dir → Pres Enterprise
        { positionIndex: 7, reportsToIndex: 2, type: "direct" }, // Ent Sales Dir → Pres Enterprise
        { positionIndex: 8, reportsToIndex: 3, type: "direct" }, // RD Europe → Pres Intl
        { positionIndex: 9, reportsToIndex: 3, type: "direct" }, // RD APAC → Pres Intl
      ],
      costCenters: [
        { code: "CC-HQ", name: "Corporate HQ" },
        { code: "CC-CONSUMER", name: "Consumer Products" },
        { code: "CC-ENTERPRISE", name: "Enterprise Solutions" },
        { code: "CC-INTL", name: "International" },
      ],
      governanceNotes:
        "Divisional model: each division president has P&L ownership and autonomous decision-making within strategic guardrails set by the CEO.",
      decisionRights:
        "Division Presidents own budget, hiring, and product strategy for their division. Corporate HQ retains capital allocation, M&A, and cross-division policy. Regional Directors have local market authority.",
      escalationPath:
        "Team Lead → Director → Division President → CEO. Cross-division disputes are mediated by CEO with input from Corporate Strategy.",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. MATRIX — Dual-reporting functional + project/product
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "Matrix Organization",
    structureModel: "matrix",
    description:
      "Dual reporting structure combining functional expertise with project/product focus. Employees report to both a functional manager and a project/product manager. Best for complex organizations that need deep specialization AND cross-functional delivery.",
    isSystem: true,
    snapshot: {
      legalEntity: { code: "MTX-CORP", name: "Matrix Technologies Corp", type: "company" },
      orgUnits: [
        { code: "EXEC", name: "Executive Leadership", type: "department" },
        { code: "ENG-FUNC", name: "Engineering Function", type: "department", parentIndex: 0 },
        { code: "DESIGN-FUNC", name: "Design Function", type: "department", parentIndex: 0 },
        { code: "QA-FUNC", name: "Quality Assurance Function", type: "department", parentIndex: 0 },
        { code: "PROD-ALPHA", name: "Product Alpha", type: "business_unit", parentIndex: 0 },
        { code: "PROD-BETA", name: "Product Beta", type: "business_unit", parentIndex: 0 },
        { code: "PROJ-X", name: "Strategic Project X", type: "team", parentIndex: 0 },
      ],
      jobs: [
        { code: "JOB-CEO", title: "Chief Executive Officer", family: "Executive", level: "C-Suite", levelRank: 100 },
        { code: "JOB-FUNC-HEAD", title: "Functional Head", family: "Management", level: "VP", levelRank: 90 },
        { code: "JOB-PROD-MGR", title: "Product Manager", family: "Product", level: "Director", levelRank: 85 },
        { code: "JOB-PROJ-MGR", title: "Project Manager", family: "Project Management", level: "Manager", levelRank: 75 },
        { code: "JOB-LEAD", title: "Team Lead", family: "Individual Contributor", level: "Lead", levelRank: 65 },
        { code: "JOB-IC", title: "Individual Contributor", family: "Individual Contributor", level: "Mid", levelRank: 50 },
      ],
      positions: [
        { code: "POS-CEO", title: "CEO", jobIndex: 0, orgUnitIndex: 0 },
        { code: "POS-HEAD-ENG", title: "Head of Engineering", jobIndex: 1, orgUnitIndex: 1 },
        { code: "POS-HEAD-DESIGN", title: "Head of Design", jobIndex: 1, orgUnitIndex: 2 },
        { code: "POS-HEAD-QA", title: "Head of QA", jobIndex: 1, orgUnitIndex: 3 },
        { code: "POS-PM-ALPHA", title: "Product Manager, Alpha", jobIndex: 2, orgUnitIndex: 4 },
        { code: "POS-PM-BETA", title: "Product Manager, Beta", jobIndex: 2, orgUnitIndex: 5 },
        { code: "POS-PJ-X", title: "Project Manager, Project X", jobIndex: 3, orgUnitIndex: 6 },
        { code: "POS-LEAD-A-ENG", title: "Alpha Eng Lead", jobIndex: 4, orgUnitIndex: 1 },
        { code: "POS-LEAD-B-ENG", title: "Beta Eng Lead", jobIndex: 4, orgUnitIndex: 1 },
      ],
      reportingLines: [
        { positionIndex: 1, reportsToIndex: 0, type: "direct" },     // Head Eng → CEO
        { positionIndex: 2, reportsToIndex: 0, type: "direct" },     // Head Design → CEO
        { positionIndex: 3, reportsToIndex: 0, type: "direct" },     // Head QA → CEO
        { positionIndex: 4, reportsToIndex: 0, type: "direct" },     // PM Alpha → CEO
        { positionIndex: 5, reportsToIndex: 0, type: "direct" },     // PM Beta → CEO
        { positionIndex: 6, reportsToIndex: 0, type: "dotted" },     // PJ X → CEO (dotted)
        { positionIndex: 7, reportsToIndex: 1, type: "direct" },     // Alpha Eng Lead → Head Eng (functional)
        { positionIndex: 7, reportsToIndex: 4, type: "dotted" },     // Alpha Eng Lead → PM Alpha (product)
        { positionIndex: 8, reportsToIndex: 1, type: "direct" },     // Beta Eng Lead → Head Eng (functional)
        { positionIndex: 8, reportsToIndex: 5, type: "dotted" },     // Beta Eng Lead → PM Beta (product)
      ],
      costCenters: [
        { code: "CC-ENG", name: "Engineering Function" },
        { code: "CC-DESIGN", name: "Design Function" },
        { code: "CC-QA", name: "QA Function" },
        { code: "CC-PROD-A", name: "Product Alpha" },
        { code: "CC-PROD-B", name: "Product Beta" },
      ],
      governanceNotes:
        "Matrix model: dual reporting lines. Functional heads own skill development, career progression, and technical standards. Product/Project managers own delivery, priorities, and cross-functional coordination.",
      decisionRights:
        "Functional heads: hiring, skill standards, tooling. Product Managers: feature prioritization, sprint goals, release decisions. Conflicts between functional and product managers escalate to CEO.",
      escalationPath:
        "IC → Functional Lead + Product Manager (dual). Conflicts → Functional Head + Product Director → CEO. Project-specific: PM → Project Sponsor → CEO.",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. FLAT — Minimal hierarchy, wide spans
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "Flat Organization",
    structureModel: "flat",
    description:
      "Minimal management layers with wide spans of control. Decision-making is decentralized, and teams self-organize around outcomes. Best for startups, innovation labs, and organizations that value agility and autonomy.",
    isSystem: true,
    snapshot: {
      legalEntity: { code: "FLAT-INC", name: "Flat Ventures Inc", type: "company" },
      orgUnits: [
        { code: "CORE", name: "Core Team", type: "group" },
        { code: "SQUAD-GROWTH", name: "Growth Squad", type: "team", parentIndex: 0 },
        { code: "SQUAD-PLATFORM", name: "Platform Squad", type: "team", parentIndex: 0 },
        { code: "SQUAD-CX", name: "Customer Experience Squad", type: "team", parentIndex: 0 },
        { code: "SHARED-SVC", name: "Shared Services", type: "team", parentIndex: 0 },
      ],
      jobs: [
        { code: "JOB-FOUNDER", title: "Founder / CEO", family: "Leadership", level: "Founder", levelRank: 100 },
        { code: "JOB-SQUAD-LEAD", title: "Squad Lead", family: "Leadership", level: "Lead", levelRank: 70 },
        { code: "JOB-MAKER", title: "Maker", family: "Individual Contributor", level: "IC", levelRank: 50 },
        { code: "JOB-OPS", title: "Operations Coordinator", family: "Operations", level: "IC", levelRank: 50 },
      ],
      positions: [
        { code: "POS-FOUNDER", title: "Founder / CEO", jobIndex: 0, orgUnitIndex: 0 },
        { code: "POS-LEAD-GROWTH", title: "Growth Squad Lead", jobIndex: 1, orgUnitIndex: 1 },
        { code: "POS-LEAD-PLATFORM", title: "Platform Squad Lead", jobIndex: 1, orgUnitIndex: 2 },
        { code: "POS-LEAD-CX", title: "CX Squad Lead", jobIndex: 1, orgUnitIndex: 3 },
        { code: "POS-OPS", title: "Operations Coordinator", jobIndex: 3, orgUnitIndex: 4 },
        { code: "POS-MAKER-1", title: "Full-Stack Maker", jobIndex: 2, orgUnitIndex: 1 },
        { code: "POS-MAKER-2", title: "Product Designer", jobIndex: 2, orgUnitIndex: 3 },
      ],
      reportingLines: [
        { positionIndex: 1, reportsToIndex: 0, type: "direct" }, // Growth Lead → Founder
        { positionIndex: 2, reportsToIndex: 0, type: "direct" }, // Platform Lead → Founder
        { positionIndex: 3, reportsToIndex: 0, type: "direct" }, // CX Lead → Founder
        { positionIndex: 4, reportsToIndex: 0, type: "direct" }, // Ops → Founder
        { positionIndex: 5, reportsToIndex: 1, type: "direct" }, // Maker 1 → Growth Lead
        { positionIndex: 6, reportsToIndex: 3, type: "direct" }, // Maker 2 → CX Lead
      ],
      costCenters: [
        { code: "CC-CORE", name: "Core Operations" },
        { code: "CC-SQUADS", name: "Squad Budgets" },
      ],
      governanceNotes:
        "Flat model: 2 layers max (Founder + Squad Leads). Squads self-organize around OKRs. Decisions are made at the team level by default; only strategic/budget decisions require Founder sign-off.",
      decisionRights:
        "Squad Leads own sprint priorities, hiring recommendations, and tool choices. Founder retains strategy, fundraising, and compensation decisions. All-hands vote on major product pivots.",
      escalationPath:
        "Maker → Squad Lead → Founder. Cross-squad alignment happens in weekly sync. No middle management layer.",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. NETWORK — Hub + external partners/contractors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "Network Organization",
    structureModel: "network",
    description:
      "Small core team coordinates a network of external partners, contractors, and service providers. Best for asset-light businesses, consultancies, platform companies, or organizations that scale through partnerships rather than headcount.",
    isSystem: true,
    snapshot: {
      legalEntity: { code: "NET-HUB", name: "Network Hub LLC", type: "company" },
      orgUnits: [
        { code: "HUB", name: "Hub (Core Team)", type: "department" },
        { code: "PARTNER-NET", name: "Partner Network", type: "group", parentIndex: 0 },
        { code: "CONTRACTOR-POOL", name: "Contractor Pool", type: "group", parentIndex: 0 },
        { code: "STRAT-ALLIANCES", name: "Strategic Alliances", type: "group", parentIndex: 0 },
        { code: "HUB-OPS", name: "Hub Operations", type: "team", parentIndex: 0 },
        { code: "HUB-BIZ-DEV", name: "Business Development", type: "team", parentIndex: 0 },
      ],
      jobs: [
        { code: "JOB-MD", title: "Managing Director", family: "Leadership", level: "MD", levelRank: 100 },
        { code: "JOB-NET-COORD", title: "Network Coordinator", family: "Operations", level: "Manager", levelRank: 75 },
        { code: "JOB-PARTNER-MGR", title: "Partner Manager", family: "Business Development", level: "Manager", levelRank: 75 },
        { code: "JOB-CONTRACTOR-MGR", title: "Contractor Manager", family: "Operations", level: "Manager", levelRank: 70 },
        { code: "JOB-ALLIANCE-DIR", title: "Alliance Director", family: "Business Development", level: "Director", levelRank: 85 },
        { code: "JOB-OPS-ANALYST", title: "Operations Analyst", family: "Operations", level: "IC", levelRank: 50 },
      ],
      positions: [
        { code: "POS-MD", title: "Managing Director", jobIndex: 0, orgUnitIndex: 0 },
        { code: "POS-NET-COORD", title: "Network Coordinator", jobIndex: 1, orgUnitIndex: 0 },
        { code: "POS-PARTNER-MGR", title: "Partner Manager", jobIndex: 2, orgUnitIndex: 1 },
        { code: "POS-CONTRACTOR-MGR", title: "Contractor Pool Manager", jobIndex: 3, orgUnitIndex: 2 },
        { code: "POS-ALLIANCE-DIR", title: "Strategic Alliance Director", jobIndex: 4, orgUnitIndex: 3 },
        { code: "POS-OPS-LEAD", title: "Hub Ops Lead", jobIndex: 5, orgUnitIndex: 4 },
        { code: "POS-BIZ-DEV", title: "Business Development Lead", jobIndex: 2, orgUnitIndex: 5 },
      ],
      reportingLines: [
        { positionIndex: 1, reportsToIndex: 0, type: "direct" },     // Net Coord → MD
        { positionIndex: 2, reportsToIndex: 1, type: "direct" },     // Partner Mgr → Net Coord
        { positionIndex: 3, reportsToIndex: 1, type: "direct" },     // Contractor Mgr → Net Coord
        { positionIndex: 4, reportsToIndex: 0, type: "direct" },     // Alliance Dir → MD
        { positionIndex: 5, reportsToIndex: 1, type: "direct" },     // Ops Lead → Net Coord
        { positionIndex: 6, reportsToIndex: 0, type: "direct" },     // Biz Dev → MD
        { positionIndex: 2, reportsToIndex: 4, type: "dotted" },     // Partner Mgr → Alliance Dir (dotted)
      ],
      costCenters: [
        { code: "CC-HUB", name: "Hub Core" },
        { code: "CC-PARTNERS", name: "Partner Payments" },
        { code: "CC-CONTRACTORS", name: "Contractor Payments" },
        { code: "CC-ALLIANCES", name: "Strategic Alliances" },
      ],
      governanceNotes:
        "Network model: the Hub sets standards, quality gates, and SLAs. Partners and contractors operate independently within agreed frameworks. The Network Coordinator is the single point of orchestration.",
      decisionRights:
        "MD: strategy, alliance approvals, budget. Network Coordinator: operational orchestration, partner onboarding, contractor selection. Alliance Director: partnership terms, joint ventures. Partners own their delivery within SLA bounds.",
      escalationPath:
        "Partner/Contractor issue → Partner/Contractor Manager → Network Coordinator → MD. Alliance issues → Alliance Director → MD. Hub internal: Ops Lead → Net Coord → MD.",
    },
  },
];

/**
 * Seed OM templates — idempotent, only inserts missing templates.
 * Returns { created, skipped } counts.
 */
export async function seedOmTemplates(): Promise<{ created: number; skipped: number }> {
  const db = getDb();
  if (!db) return { created: 0, skipped: 0 };

  let created = 0;
  let skipped = 0;

  for (const tpl of TEMPLATES) {
    // Check if template already exists by name
    const existing = await db
      .select({ id: omOrgTemplates.id })
      .from(omOrgTemplates)
      .where(eq(omOrgTemplates.name, tpl.name))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await db.insert(omOrgTemplates).values({
      name: tpl.name,
      structureModel: tpl.structureModel,
      description: tpl.description,
      isSystem: tpl.isSystem,
      snapshot: tpl.snapshot,
    });
    created++;
  }

  return { created, skipped };
}
