/**
 * WfDB — Seed Script
 *
 * Seeds the `wfdb` DB with the 12 reference workflows + 8 triggers.
 * Idempotent: skips if workflows already exist.
 *
 * Called on server startup and via tRPC `sandboxWf.seed` mutation.
 */

import { sql } from "drizzle-orm";
import { getWfDb, resetWfDb } from "./connection";
import { wfWorkflows, wfSteps, wfTriggers, wfTemplates } from "../../drizzle/tables/wfdb";
import { WORKFLOW_TEMPLATES } from "./templates";

// ── Workflow Seed Data ───────────────────────────────────────────────────────

const WORKFLOWS = [
  {
    name: "Approval Routing Engine", category: "decision", status: "running",
    description: "Dynamic approval routing based on amount, role, category, and risk level. Supports escalation logic and human-in-the-loop overrides.",
    tags: ["Conditional Branching", "Escalation", "HITL"], updatedAgo: "5m ago",
    steps: [
      { key: "ingest", label: "Ingest Request", status: "done", description: "Receive approval request with metadata (amount, category, risk)" },
      { key: "classify", label: "Risk Classification", status: "done", description: "Score request using decision tables (low/medium/high/critical)" },
      { key: "route", label: "Route to Approver", status: "done", description: "Select approver by role + amount threshold + category rules" },
      { key: "approve", label: "Approval Gate", status: "running", description: "Human-in-the-loop review — approve, reject, or escalate" },
      { key: "escalate", label: "Escalation Check", status: "pending", description: "If deadline missed → auto-escalate to next-level approver" },
      { key: "audit", label: "Audit & Explain", status: "pending", description: "Log decision rationale — explainability trail for compliance" },
      { key: "complete", label: "Complete", status: "pending", description: "Emit completion event + update versioned decision record" },
    ],
  },
  {
    name: "Scoring & Prioritization Pipeline", category: "decision", status: "completed",
    description: "Classify and rank incoming work items using configurable scoring criteria before routing to the next workflow step.",
    tags: ["Scoring", "Decision Tables", "Versioned Rules"], updatedAgo: "1h ago",
    steps: [
      { key: "receive", label: "Receive Items", status: "done", description: "Batch-receive work items from upstream systems" },
      { key: "score", label: "Apply Scoring Rules", status: "done", description: "Evaluate each item against weighted criteria (decision table v3.2)" },
      { key: "rank", label: "Rank & Classify", status: "done", description: "Sort by composite score → assign priority tier (P0-P4)" },
      { key: "route", label: "Route by Priority", status: "done", description: "P0→immediate, P1→next sprint, P2-P4→backlog" },
      { key: "version", label: "Version Snapshot", status: "done", description: "Save decision version for rollback safety" },
    ],
  },
  {
    name: "Multi-System Integration Sync", category: "integration", status: "running",
    description: "Bidirectional sync between SaaS connectors, ERP/CRM systems, and cloud platforms.",
    tags: ["SaaS", "ERP/CRM", "REST", "Cloud"], updatedAgo: "2m ago",
    steps: [
      { key: "discover", label: "Discover Connectors", status: "done", description: "Scan configured connectors (Salesforce, SAP, Jira, GitHub)" },
      { key: "auth", label: "Authenticate", status: "done", description: "OAuth2 / API key validation for each connector" },
      { key: "map", label: "Field Mapping", status: "done", description: "Map source fields → target fields with transformation rules" },
      { key: "sync", label: "Execute Sync", status: "running", description: "Bidirectional delta sync — 2,847 records processed" },
      { key: "validate", label: "Validate Results", status: "pending", description: "Check data integrity, type conformance, referential constraints" },
      { key: "report", label: "Sync Report", status: "pending", description: "Generate sync report with conflict resolution log" },
    ],
  },
  {
    name: "Git/Jira Developer Workflow", category: "integration", status: "completed",
    description: "Coordinate software teams by linking Git commits, Jira tickets, and CI/CD pipelines.",
    tags: ["Git", "Jira", "CI/CD", "DevOps"], updatedAgo: "30m ago",
    steps: [
      { key: "ticket", label: "Jira Ticket Created", status: "done", description: "Webhook receives new Jira issue → extract metadata" },
      { key: "branch", label: "Branch Auto-Create", status: "done", description: "Create feature branch from ticket key (PROJ-123)" },
      { key: "pr", label: "PR Detection", status: "done", description: "GitHub webhook detects PR → link to Jira ticket" },
      { key: "ci", label: "CI Pipeline Run", status: "done", description: "Trigger build + test + lint via GitHub Actions" },
      { key: "deploy", label: "Deploy to Staging", status: "done", description: "Auto-deploy to staging on CI pass" },
      { key: "close", label: "Close Ticket", status: "done", description: "Transition Jira ticket to Done on merge" },
    ],
  },
  {
    name: "RAG Document Processing Pipeline", category: "ai", status: "running",
    description: "Intelligent document processing with RAG pipelines for contextual AI reasoning.",
    tags: ["RAG", "Embeddings", "IDP", "AI Routing"], updatedAgo: "1m ago",
    steps: [
      { key: "upload", label: "Document Ingestion", status: "done", description: "Accept PDF/DOCX/TXT — validate format and size" },
      { key: "extract", label: "Content Extraction", status: "done", description: "OCR + text extraction + metadata parsing" },
      { key: "chunk", label: "Chunking", status: "done", description: "Split into semantic chunks (512 tokens, 128 overlap)" },
      { key: "embed", label: "Generate Embeddings", status: "running", description: "Encode chunks via embedding model — 342/500 done" },
      { key: "store", label: "Vector DB Store", status: "pending", description: "Upsert embeddings into Qdrant collection" },
      { key: "index", label: "Search Index", status: "pending", description: "Build HNSW index for fast retrieval" },
      { key: "ready", label: "RAG Ready", status: "pending", description: "Pipeline complete — documents available for AI queries" },
    ],
  },
  {
    name: "AI-Driven Decision Routing", category: "ai", status: "completed",
    description: "Intelligence-first mode: AI analyzes requests, classifies intent, extracts entities, routes to optimal path.",
    tags: ["AI Routing", "NLP", "Classification"], updatedAgo: "15m ago",
    steps: [
      { key: "receive", label: "Receive Request", status: "done", description: "Accept natural language request via API/chat" },
      { key: "classify", label: "Intent Classification", status: "done", description: "LLM classifies intent (approval, query, escalation, report)" },
      { key: "extract", label: "Entity Extraction", status: "done", description: "Extract key entities: dates, amounts, people, systems" },
      { key: "context", label: "RAG Context Lookup", status: "done", description: "Query vector DB for relevant policy/procedure context" },
      { key: "decide", label: "AI Decision", status: "done", description: "Generate decision with confidence score + explanation" },
      { key: "route", label: "Route to Workflow", status: "done", description: "Dispatch to target workflow or human reviewer if confidence < 0.8" },
    ],
  },
  {
    name: "Compliance Audit Trail Generator", category: "governance", status: "completed",
    description: "Full audit trail generation for regulated industries. ACL verification, policy enforcement, compliance reporting.",
    tags: ["Audit", "ACL", "Compliance", "Jakarta EE"], updatedAgo: "2h ago",
    steps: [
      { key: "collect", label: "Collect Events", status: "done", description: "Aggregate all mutation events from last 24h" },
      { key: "enrich", label: "Enrich with Context", status: "done", description: "Attach actor, role, workspace, module, timestamp" },
      { key: "acl", label: "ACL Verification", status: "done", description: "Verify each action within granted permissions" },
      { key: "policy", label: "Policy Check", status: "done", description: "Evaluate against active governance policies (v2.1)" },
      { key: "report", label: "Generate Report", status: "done", description: "Produce compliance report with pass/fail per rule" },
      { key: "sign", label: "Digital Signature", status: "done", description: "Sign report with org certificate" },
      { key: "archive", label: "Archive", status: "done", description: "Store in immutable audit archive with 7-year retention" },
    ],
  },
  {
    name: "Version-Safe Rule Deployment", category: "governance", status: "draft",
    description: "Safely deploy updated business rules without breaking running workflows.",
    tags: ["Versioning", "Safe Deploy", "Rollback"], updatedAgo: "4h ago",
    steps: [
      { key: "draft", label: "Draft New Rules", status: "pending", description: "Author new decision rules in sandbox environment" },
      { key: "validate", label: "Validate Rules", status: "pending", description: "Run validation suite against test cases" },
      { key: "diff", label: "Diff vs Current", status: "pending", description: "Show side-by-side diff of rule changes" },
      { key: "canary", label: "Canary Deploy", status: "pending", description: "Route 5% of traffic to new rules, monitor outcomes" },
      { key: "promote", label: "Promote to Live", status: "pending", description: "Replace current version after canary passes" },
      { key: "snapshot", label: "Version Snapshot", status: "pending", description: "Archive previous version for instant rollback" },
    ],
  },
  {
    name: "Offline Workflow Execution", category: "offline", status: "running",
    description: "Execute workflows locally when disconnected. Local decision evaluation, encrypted storage, sync queue.",
    tags: ["Offline", "Local Runner", "Sync", "Encrypted"], updatedAgo: "10m ago",
    steps: [
      { key: "cache", label: "Cache Workflows", status: "done", description: "Download active workflows, rules, shapes, permissions to local storage" },
      { key: "detect", label: "Detect Offline", status: "done", description: "Network monitor triggers offline mode" },
      { key: "execute", label: "Local Execution", status: "running", description: "Run workflow steps using local decision evaluator" },
      { key: "queue", label: "Queue Mutations", status: "pending", description: "Buffer write operations in encrypted sync queue" },
      { key: "reconnect", label: "Reconnect Detected", status: "pending", description: "Network restored — initiate sync protocol" },
      { key: "resolve", label: "Conflict Resolution", status: "pending", description: "Auto-merge non-conflicting changes, flag conflicts" },
      { key: "sync", label: "Sync Complete", status: "pending", description: "Zero-data-loss sync verified" },
    ],
  },
  {
    name: "Infinite Canvas Workflow Builder", category: "canvas", status: "draft",
    description: "Design workflows on an infinite canvas with real-time collaboration and AI suggestions.",
    tags: ["Infinite Canvas", "Collaboration", "CRDT", "Templates"], updatedAgo: "1d ago",
    steps: [
      { key: "template", label: "Select Template", status: "pending", description: "Choose from 100+ workflow templates or start blank" },
      { key: "canvas", label: "Open Canvas", status: "pending", description: "Initialize infinite canvas with zoom, pan, minimap" },
      { key: "shapes", label: "Add Shapes", status: "pending", description: "Drag shapes from library — connectors auto-snap" },
      { key: "collab", label: "Real-Time Collab", status: "pending", description: "Multi-cursor editing (WebSocket + CRDT)" },
      { key: "ai", label: "AI Suggestions", status: "pending", description: "AI recommends next steps, connections, optimizations" },
      { key: "layout", label: "Auto-Layout", status: "pending", description: "Apply Dagre/ELK layout algorithm" },
      { key: "publish", label: "Publish Workflow", status: "pending", description: "Convert canvas to executable workflow" },
    ],
  },
  {
    name: "Visio Import & Conversion", category: "canvas", status: "failed",
    description: "Import Microsoft Visio diagrams and auto-convert to executable workflows.",
    tags: ["Visio", "Import", "Auto-Convert", "M365"], updatedAgo: "3h ago",
    steps: [
      { key: "upload", label: "Upload .vsdx File", status: "done", description: "Accept Visio file — parse XML structure" },
      { key: "parse", label: "Parse Shapes", status: "done", description: "Identify shapes, connectors, text, layers" },
      { key: "map", label: "Map to WF Nodes", status: "done", description: "Convert Visio shapes → workflow nodes" },
      { key: "connect", label: "Wire Connectors", status: "done", description: "Translate Visio connectors to workflow edges" },
      { key: "layout", label: "Auto-Layout", status: "failed", description: "Layout failed — circular dependency in connector graph" },
      { key: "review", label: "Human Review", status: "pending", description: "Manual fix for layout errors" },
    ],
  },
  {
    name: "ETL Data Orchestration Pipeline", category: "integration", status: "completed",
    description: "End-to-end ETL across cloud platforms. Multi-cloud distributed execution with unlimited data ingestion.",
    tags: ["ETL", "Multi-Cloud", "No Limits"], updatedAgo: "45m ago",
    steps: [
      { key: "extract", label: "Extract Sources", status: "done", description: "Pull from 5 data sources (S3, BigQuery, PostgreSQL, Salesforce, API)" },
      { key: "validate", label: "Schema Validation", status: "done", description: "Validate source schemas against expected contracts" },
      { key: "transform", label: "Transform", status: "done", description: "Apply 12 transformation rules (dedup, normalize, enrich)" },
      { key: "quality", label: "Data Quality Check", status: "done", description: "Run quality rules — 99.7% pass rate" },
      { key: "load", label: "Load to Warehouse", status: "done", description: "Bulk insert into data warehouse (2.3M rows)" },
      { key: "notify", label: "Notify Downstream", status: "done", description: "Emit completion event to dependent pipelines" },
    ],
  },
];

// ── Trigger Seed Data ────────────────────────────────────────────────────────

const TRIGGERS = [
  { name: "Webhook — POST /api/trigger/ingest", type: "HTTP", status: "active", fireCount: 342, targetWfName: "Approval Routing Engine" },
  { name: "Cron — Every day at 02:00 UTC", type: "Schedule", status: "active", fireCount: 89, targetWfName: "ETL Data Orchestration Pipeline" },
  { name: "Jira Issue Created (PROJ-*)", type: "Webhook", status: "active", fireCount: 156, targetWfName: "Git/Jira Developer Workflow" },
  { name: "Document Upload Event", type: "Event", status: "active", fireCount: 78, targetWfName: "RAG Document Processing Pipeline" },
  { name: "Network Disconnect Detected", type: "System", status: "active", fireCount: 12, targetWfName: "Offline Workflow Execution" },
  { name: "Compliance Report — Monthly", type: "Schedule", status: "active", fireCount: 6, targetWfName: "Compliance Audit Trail Generator" },
  { name: "Manual — User-Initiated", type: "Manual", status: "paused", fireCount: 0, targetWfName: "Version-Safe Rule Deployment" },
  { name: "AI Confidence < 0.8", type: "Condition", status: "active", fireCount: 23, targetWfName: "AI-Driven Decision Routing" },
];

// ── Create Tables ────────────────────────────────────────────────────────────

async function createTables(db: NonNullable<ReturnType<typeof getWfDb>>) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wf_workflows (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      tags JSON DEFAULT '[]',
      nodes TEXT DEFAULT '',
      edges TEXT DEFAULT '',
      updated_ago VARCHAR(50) DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wf_steps (
      id SERIAL PRIMARY KEY,
      workflow_id INTEGER NOT NULL,
      key VARCHAR(50) NOT NULL,
      label VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wf_executions (
      id SERIAL PRIMARY KEY,
      workflow_id INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'running',
      started_at TIMESTAMP DEFAULT NOW() NOT NULL,
      completed_at TIMESTAMP,
      duration INTEGER,
      trigger_type VARCHAR(50) DEFAULT 'manual',
      trigger_data JSON DEFAULT '{}',
      error TEXT
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wf_execution_logs (
      id SERIAL PRIMARY KEY,
      execution_id INTEGER NOT NULL,
      step_key VARCHAR(50) DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'info',
      started_at TIMESTAMP DEFAULT NOW() NOT NULL,
      completed_at TIMESTAMP,
      duration INTEGER,
      input JSON DEFAULT '{}',
      output JSON DEFAULT '{}',
      error TEXT,
      log_level VARCHAR(10) DEFAULT 'INFO',
      message TEXT DEFAULT ''
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wf_triggers (
      id SERIAL PRIMARY KEY,
      workflow_id INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      config JSON DEFAULT '{}',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      fire_count INTEGER NOT NULL DEFAULT 0,
      target_workflow_name VARCHAR(255) DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // New columns (safe to re-run)
  await db.execute(sql`ALTER TABLE wf_steps ADD COLUMN IF NOT EXISTS node_type VARCHAR(50) DEFAULT 'action'`);
  await db.execute(sql`ALTER TABLE wf_steps ADD COLUMN IF NOT EXISTS config JSON DEFAULT '{}'`);
  await db.execute(sql`ALTER TABLE wf_workflows ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1`);

  // Table 6: Versions
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wf_versions (
      id SERIAL PRIMARY KEY,
      workflow_id INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      snapshot JSON DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // Table 7: Templates
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wf_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category VARCHAR(50) NOT NULL,
      icon VARCHAR(50) DEFAULT '',
      nodes JSON DEFAULT '[]',
      edges JSON DEFAULT '[]',
      steps JSON DEFAULT '[]',
      tags JSON DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  // Create indexes
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wf_workflows_category ON wf_workflows(category)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wf_workflows_status ON wf_workflows(status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wf_steps_workflow ON wf_steps(workflow_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wf_executions_workflow ON wf_executions(workflow_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wf_executions_status ON wf_executions(status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wf_exec_logs_execution ON wf_execution_logs(execution_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wf_triggers_workflow ON wf_triggers(workflow_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wf_versions_workflow ON wf_versions(workflow_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wf_templates_category ON wf_templates(category)`);
}

// ── Seed Execution ───────────────────────────────────────────────────────────

export async function seedWfDb() {
  const db = getWfDb();
  if (!db) throw new Error("Cannot connect to wfdb");

  // Create tables
  await createTables(db);

  // ── Seed workflows (idempotent) ──────────────────────────────────────────
  let workflowsSeeded = false;
  const existing = await db.select({ id: wfWorkflows.id }).from(wfWorkflows).limit(1);
  if (existing.length === 0) {
    for (const wfData of WORKFLOWS) {
      const [wf] = await db
        .insert(wfWorkflows)
        .values({
          name: wfData.name,
          description: wfData.description,
          category: wfData.category,
          status: wfData.status,
          tags: wfData.tags,
          updatedAgo: wfData.updatedAgo,
        })
        .returning();

      if (wfData.steps.length > 0) {
        await db.insert(wfSteps).values(
          wfData.steps.map((s, i) => ({
            workflowId: wf.id,
            key: s.key,
            label: s.label,
            description: s.description,
            status: s.status,
            sortOrder: i,
          }))
        );
      }
    }

    // Insert triggers — map target workflow names to IDs
    const allWfs = await db.select().from(wfWorkflows);
    for (const trig of TRIGGERS) {
      const targetWf = allWfs.find((w) => w.name === trig.targetWfName);
      await db.insert(wfTriggers).values({
        workflowId: targetWf?.id || 0,
        name: trig.name,
        type: trig.type,
        status: trig.status,
        fireCount: trig.fireCount,
        targetWorkflowName: trig.targetWfName,
      });
    }
    workflowsSeeded = true;
  }

  // ── Seed templates (independent, idempotent) ───────────────────────────
  let templatesSeeded = false;
  const existingTemplates = await db.select({ id: wfTemplates.id }).from(wfTemplates).limit(1);
  if (existingTemplates.length === 0) {
    for (const tmpl of WORKFLOW_TEMPLATES) {
      await db.insert(wfTemplates).values({
        name: tmpl.name,
        description: tmpl.description,
        category: tmpl.category,
        icon: tmpl.icon,
        steps: tmpl.steps,
        tags: tmpl.tags,
      });
    }
    templatesSeeded = true;
  }

  if (!workflowsSeeded && !templatesSeeded) {
    const count = await db.select({ id: wfWorkflows.id }).from(wfWorkflows);
    return { seeded: false, workflows: count.length, message: "Already seeded" };
  }

  resetWfDb();

  const wfCount = await db.select({ id: wfWorkflows.id }).from(wfWorkflows);
  return {
    seeded: true,
    workflows: wfCount.length,
    triggers: TRIGGERS.length,
    steps: WORKFLOWS.reduce((a, w) => a + w.steps.length, 0),
    templates: WORKFLOW_TEMPLATES.length,
  };
}

/** Called from server startup — idempotent */
export async function ensureWfDbSeeded() {
  return seedWfDb();
}
