/**
 * Sandbox WF — Landing page (Double IBM Shell)
 *
 * Workflows derived from AppDescription.docx + AppDesign-ReadyBlueprint.docx:
 *   6 core platform pillars → 6 workflow categories
 *   Each workflow has real steps matching the design document flows
 *
 * Double Shell pattern (cloned from DoubleShellPage):
 * - S1 (Categories): always visible, icons when collapsed
 * - S2 (Workflow Steps): hidden when collapsed, shows steps of selected WF
 * - Single toggle on S1 controls both
 * - Mobile: always collapsed
 */
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Workflow,
  GitBranch,
  Layers,
  Settings,
  Zap,
  Clock,
  BarChart3,
  Shield,
  Brain,
  Plug,
  WifiOff,
  LayoutDashboard,
  ArrowRight,
  Users,
  FileText,
  Database,
  Lock,
  Eye,
  Gauge,
  Loader2,
  ChevronRight,
  Timer,
  Network,
  Boxes,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────

interface WFStep {
  key: string;
  label: string;
  status: "done" | "running" | "pending" | "failed";
  description: string;
}

interface WFWorkflow {
  id: number;
  name: string;
  category: string;
  status: "running" | "completed" | "failed" | "draft";
  description: string;
  steps: WFStep[];
  tags: string[];
  updatedAgo: string;
}

// ── S1 nav items (Categories from AppDescription pillars) ──

const S1_ITEMS = [
  { key: "all", label: "All Workflows", icon: Layers },
  { key: "decision", label: "Decision Engine", icon: GitBranch },
  { key: "integration", label: "Integrations", icon: Plug },
  { key: "ai", label: "AI Intelligence", icon: Brain },
  { key: "governance", label: "Governance", icon: Shield },
  { key: "offline", label: "Offline Exec", icon: WifiOff },
  { key: "canvas", label: "Canvas Builder", icon: LayoutDashboard },
];

// ── Workflows — derived from AppDescription + AppDesign ──

const WORKFLOWS: WFWorkflow[] = [
  // ── Decision Engine Pillar ──────────────────────────
  {
    id: 1,
    name: "Approval Routing Engine",
    category: "decision",
    status: "running",
    description: "Dynamic approval routing based on amount, role, category, and risk level. Supports escalation logic and human-in-the-loop overrides.",
    tags: ["Conditional Branching", "Escalation", "HITL"],
    updatedAgo: "5m ago",
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
    id: 2,
    name: "Scoring & Prioritization Pipeline",
    category: "decision",
    status: "completed",
    description: "Classify and rank incoming work items using configurable scoring criteria before routing to the next workflow step.",
    tags: ["Scoring", "Decision Tables", "Versioned Rules"],
    updatedAgo: "1h ago",
    steps: [
      { key: "receive", label: "Receive Items", status: "done", description: "Batch-receive work items from upstream systems" },
      { key: "score", label: "Apply Scoring Rules", status: "done", description: "Evaluate each item against weighted criteria (decision table v3.2)" },
      { key: "rank", label: "Rank & Classify", status: "done", description: "Sort by composite score → assign priority tier (P0-P4)" },
      { key: "route", label: "Route by Priority", status: "done", description: "P0→immediate, P1→next sprint, P2-P4→backlog" },
      { key: "version", label: "Version Snapshot", status: "done", description: "Save decision version for rollback safety" },
    ],
  },

  // ── Integration Pillar ──────────────────────────────
  {
    id: 3,
    name: "Multi-System Integration Sync",
    category: "integration",
    status: "running",
    description: "Bidirectional sync between SaaS connectors, ERP/CRM systems, and cloud platforms. REST/API hooks with authentication mapping.",
    tags: ["SaaS", "ERP/CRM", "REST", "Cloud"],
    updatedAgo: "2m ago",
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
    id: 4,
    name: "Git/Jira Developer Workflow",
    category: "integration",
    status: "completed",
    description: "Coordinate software teams by linking Git commits, Jira tickets, and CI/CD pipelines into a single traceable flow.",
    tags: ["Git", "Jira", "CI/CD", "DevOps"],
    updatedAgo: "30m ago",
    steps: [
      { key: "ticket", label: "Jira Ticket Created", status: "done", description: "Webhook receives new Jira issue → extract metadata" },
      { key: "branch", label: "Branch Auto-Create", status: "done", description: "Create feature branch from ticket key (PROJ-123)" },
      { key: "pr", label: "PR Detection", status: "done", description: "GitHub webhook detects PR → link to Jira ticket" },
      { key: "ci", label: "CI Pipeline Run", status: "done", description: "Trigger build + test + lint via GitHub Actions" },
      { key: "deploy", label: "Deploy to Staging", status: "done", description: "Auto-deploy to staging on CI pass" },
      { key: "close", label: "Close Ticket", status: "done", description: "Transition Jira ticket to Done on merge" },
    ],
  },

  // ── AI Intelligence Pillar ──────────────────────────
  {
    id: 5,
    name: "RAG Document Processing Pipeline",
    category: "ai",
    status: "running",
    description: "Intelligent document processing with RAG pipelines for contextual AI reasoning. Extracts meaning from files, generates embeddings, and routes to vector DB.",
    tags: ["RAG", "Embeddings", "IDP", "AI Routing"],
    updatedAgo: "1m ago",
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
    id: 6,
    name: "AI-Driven Decision Routing",
    category: "ai",
    status: "completed",
    description: "Intelligence-first mode: AI analyzes incoming requests, classifies intent, extracts entities, and routes to the optimal workflow path.",
    tags: ["AI Routing", "NLP", "Classification"],
    updatedAgo: "15m ago",
    steps: [
      { key: "receive", label: "Receive Request", status: "done", description: "Accept natural language request via API/chat" },
      { key: "classify", label: "Intent Classification", status: "done", description: "LLM classifies intent (approval, query, escalation, report)" },
      { key: "extract", label: "Entity Extraction", status: "done", description: "Extract key entities: dates, amounts, people, systems" },
      { key: "context", label: "RAG Context Lookup", status: "done", description: "Query vector DB for relevant policy/procedure context" },
      { key: "decide", label: "AI Decision", status: "done", description: "Generate decision with confidence score + explanation" },
      { key: "route", label: "Route to Workflow", status: "done", description: "Dispatch to target workflow or human reviewer if confidence < 0.8" },
    ],
  },

  // ── Governance & Compliance Pillar ──────────────────
  {
    id: 7,
    name: "Compliance Audit Trail Generator",
    category: "governance",
    status: "completed",
    description: "Full audit trail generation for regulated industries. ACL-based access control verification, policy enforcement, and compliance reporting.",
    tags: ["Audit", "ACL", "Compliance", "Jakarta EE"],
    updatedAgo: "2h ago",
    steps: [
      { key: "collect", label: "Collect Events", status: "done", description: "Aggregate all mutation events from last 24h" },
      { key: "enrich", label: "Enrich with Context", status: "done", description: "Attach actor, role, workspace, module, timestamp to each event" },
      { key: "acl", label: "ACL Verification", status: "done", description: "Verify each action was performed within granted permissions" },
      { key: "policy", label: "Policy Check", status: "done", description: "Evaluate against active governance policies (v2.1)" },
      { key: "report", label: "Generate Report", status: "done", description: "Produce compliance report with pass/fail per policy rule" },
      { key: "sign", label: "Digital Signature", status: "done", description: "Sign report with org certificate for tamper detection" },
      { key: "archive", label: "Archive", status: "done", description: "Store in immutable audit archive with 7-year retention" },
    ],
  },
  {
    id: 8,
    name: "Version-Safe Rule Deployment",
    category: "governance",
    status: "draft",
    description: "Safely deploy updated business rules without breaking running workflows. Version control with rollback capability.",
    tags: ["Versioning", "Safe Deploy", "Rollback"],
    updatedAgo: "4h ago",
    steps: [
      { key: "draft", label: "Draft New Rules", status: "pending", description: "Author new decision rules in sandbox environment" },
      { key: "validate", label: "Validate Rules", status: "pending", description: "Run validation suite against test cases" },
      { key: "diff", label: "Diff vs Current", status: "pending", description: "Show side-by-side diff of rule changes" },
      { key: "canary", label: "Canary Deploy", status: "pending", description: "Route 5% of traffic to new rules, monitor outcomes" },
      { key: "promote", label: "Promote to Live", status: "pending", description: "Replace current version after canary passes" },
      { key: "snapshot", label: "Version Snapshot", status: "pending", description: "Archive previous version for instant rollback" },
    ],
  },

  // ── Offline Execution Pillar ────────────────────────
  {
    id: 9,
    name: "Offline Workflow Execution",
    category: "offline",
    status: "running",
    description: "Execute workflows locally when disconnected. Local decision evaluation, encrypted storage, automatic sync queue with conflict resolution.",
    tags: ["Offline", "Local Runner", "Sync", "Encrypted"],
    updatedAgo: "10m ago",
    steps: [
      { key: "cache", label: "Cache Workflows", status: "done", description: "Download active workflows, rules, shapes, and permissions to local storage" },
      { key: "detect", label: "Detect Offline", status: "done", description: "Network monitor triggers offline mode activation" },
      { key: "execute", label: "Local Execution", status: "running", description: "Run workflow steps using local decision evaluator" },
      { key: "queue", label: "Queue Mutations", status: "pending", description: "Buffer all write operations in encrypted sync queue" },
      { key: "reconnect", label: "Reconnect Detected", status: "pending", description: "Network restored — initiate sync protocol" },
      { key: "resolve", label: "Conflict Resolution", status: "pending", description: "Auto-merge non-conflicting changes, flag conflicts for review" },
      { key: "sync", label: "Sync Complete", status: "pending", description: "Zero-data-loss sync verified — all queued ops committed" },
    ],
  },

  // ── Canvas Builder Pillar ───────────────────────────
  {
    id: 10,
    name: "Infinite Canvas Workflow Builder",
    category: "canvas",
    status: "draft",
    description: "Design workflows on an infinite canvas with real-time collaboration, auto-layout, Visio import, AI suggestions, and 100+ templates.",
    tags: ["Infinite Canvas", "Collaboration", "CRDT", "Templates"],
    updatedAgo: "1d ago",
    steps: [
      { key: "template", label: "Select Template", status: "pending", description: "Choose from 100+ workflow templates or start blank" },
      { key: "canvas", label: "Open Canvas", status: "pending", description: "Initialize infinite canvas with zoom, pan, and minimap" },
      { key: "shapes", label: "Add Shapes", status: "pending", description: "Drag shapes from library — robust connectors auto-snap" },
      { key: "collab", label: "Real-Time Collab", status: "pending", description: "Multi-cursor editing with presence indicators (WebSocket + CRDT)" },
      { key: "ai", label: "AI Suggestions", status: "pending", description: "AI recommends next steps, connections, and optimizations" },
      { key: "layout", label: "Auto-Layout", status: "pending", description: "Apply Dagre/ELK layout algorithm for clean diagram" },
      { key: "publish", label: "Publish Workflow", status: "pending", description: "Convert canvas to executable workflow definition" },
    ],
  },
  {
    id: 11,
    name: "Visio Import & Conversion",
    category: "canvas",
    status: "failed",
    description: "Import Microsoft Visio diagrams and auto-convert to executable workflows with shape recognition and connector mapping.",
    tags: ["Visio", "Import", "Auto-Convert", "M365"],
    updatedAgo: "3h ago",
    steps: [
      { key: "upload", label: "Upload .vsdx File", status: "done", description: "Accept Visio file — parse XML structure" },
      { key: "parse", label: "Parse Shapes", status: "done", description: "Identify shapes, connectors, text, and layers" },
      { key: "map", label: "Map to WF Nodes", status: "done", description: "Convert Visio shapes → workflow nodes (decision, action, gateway)" },
      { key: "connect", label: "Wire Connectors", status: "done", description: "Translate Visio connectors to workflow edges" },
      { key: "layout", label: "Auto-Layout", status: "failed", description: "Layout failed — circular dependency detected in connector graph" },
      { key: "review", label: "Human Review", status: "pending", description: "Manual fix for layout errors before final conversion" },
    ],
  },

  // ── Cross-Pillar: ETL/BPM ──────────────────────────
  {
    id: 12,
    name: "ETL Data Orchestration Pipeline",
    category: "integration",
    status: "completed",
    description: "End-to-end data movement with Extract-Transform-Load across cloud platforms. Multi-cloud distributed execution with unlimited data ingestion.",
    tags: ["ETL", "Multi-Cloud", "No Limits"],
    updatedAgo: "45m ago",
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

// ── Status config ────────────────────────────────────────

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  running: { variant: "default", label: "Running" },
  completed: { variant: "secondary", label: "Completed" },
  draft: { variant: "outline", label: "Draft" },
  failed: { variant: "destructive", label: "Failed" },
};

const STEP_STATUS_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />,
  running: <Loader2 className="h-3 w-3 text-blue-500 animate-spin shrink-0" />,
  pending: <Circle className="h-3 w-3 text-muted-foreground shrink-0" />,
  failed: <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />,
};

// ── Mobile hook ──────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

// ── Main Component ───────────────────────────────────────

export default function SandboxWFPage() {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const [s1Active, setS1Active] = useState("all");
  const [selectedWF, setSelectedWF] = useState<WFWorkflow | null>(null);
  const isCollapsed = isMobile || !expanded;

  // Filter workflows by S1 category
  const filtered = useMemo(() => {
    if (s1Active === "all") return WORKFLOWS;
    return WORKFLOWS.filter((w) => w.category === s1Active);
  }, [s1Active]);

  // Stats
  const stats = useMemo(() => ({
    running: WORKFLOWS.filter((w) => w.status === "running").length,
    completed: WORKFLOWS.filter((w) => w.status === "completed").length,
    failed: WORKFLOWS.filter((w) => w.status === "failed").length,
    draft: WORKFLOWS.filter((w) => w.status === "draft").length,
    total: WORKFLOWS.length,
    totalSteps: WORKFLOWS.reduce((acc, w) => acc + w.steps.length, 0),
    doneSteps: WORKFLOWS.reduce((acc, w) => acc + w.steps.filter((s) => s.status === "done").length, 0),
  }), []);

  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      {/* ── S1: Categories ────────────────────────────── */}
      <div
        className={cn(
          "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
          isCollapsed ? "w-12" : "w-48",
        )}
      >
        <div
          className={cn(
            "flex items-center border-b",
            isCollapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5",
          )}
        >
          {!isCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <Workflow className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span className="text-xs font-semibold text-muted-foreground truncate">
                Categories
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setExpanded(!expanded)}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className={isCollapsed ? "px-1 py-1" : ""}>
            {S1_ITEMS.map(({ key, label, icon: Icon }) => {
              const count = key === "all" ? WORKFLOWS.length : WORKFLOWS.filter((w) => w.category === key).length;
              return (
                <button
                  key={key}
                  onClick={() => { setS1Active(key); setSelectedWF(null); }}
                  title={label}
                  className={cn(
                    "flex items-center w-full rounded-sm transition-colors",
                    isCollapsed ? "justify-center py-1.5" : "gap-2 px-3 py-1.5 text-xs",
                    s1Active === key
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  {!isCollapsed && (
                    <>
                      <span className="truncate flex-1 text-left">{label}</span>
                      <span className="text-[10px] opacity-60">{count}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* Status filter section */}
          {!isCollapsed && (
            <>
              <Separator className="my-1" />
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                By Status
              </div>
              {[
                { key: "running", icon: Play, color: "text-green-500" },
                { key: "completed", icon: CheckCircle2, color: "text-blue-500" },
                { key: "failed", icon: AlertTriangle, color: "text-red-500" },
              ].map(({ key, icon: Icon, color }) => (
                <div key={key} className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
                  <Icon className={cn("h-3 w-3 shrink-0", color)} />
                  <span className="capitalize">{key}</span>
                  <span className="ml-auto text-[10px] opacity-60">
                    {WORKFLOWS.filter((w) => w.status === key).length}
                  </span>
                </div>
              ))}
            </>
          )}
        </ScrollArea>
      </div>

      {/* ── S2: Workflow Steps (of selected WF) ───────── */}
      {!isCollapsed && (
        <div className="border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0 w-56">
          <div className="flex items-center border-b px-2 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <Boxes className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
              <span className="text-xs font-semibold text-muted-foreground truncate">
                {selectedWF ? "Steps" : "Select a workflow"}
              </span>
            </div>
          </div>

          <ScrollArea className="flex-1">
            {selectedWF ? (
              <div className="p-1">
                <div className="px-2 py-1.5 mb-1">
                  <p className="text-[10px] font-semibold text-foreground truncate">{selectedWF.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {selectedWF.steps.filter((s) => s.status === "done").length}/{selectedWF.steps.length} steps done
                  </p>
                </div>
                <Separator className="mb-1" />
                {selectedWF.steps.map((step, i) => (
                  <div
                    key={step.key}
                    className={cn(
                      "flex items-start gap-2 px-2 py-1.5 rounded-sm text-xs",
                      step.status === "running" && "bg-blue-500/5",
                      step.status === "failed" && "bg-red-500/5",
                    )}
                  >
                    <div className="mt-0.5 flex flex-col items-center">
                      {STEP_STATUS_ICON[step.status]}
                      {i < selectedWF.steps.length - 1 && (
                        <div className={cn(
                          "w-px h-4 mt-0.5",
                          step.status === "done" ? "bg-green-500/30" : "bg-muted-foreground/20",
                        )} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={cn(
                        "text-[11px] font-medium truncate",
                        step.status === "done" && "text-muted-foreground",
                        step.status === "running" && "text-blue-500",
                        step.status === "failed" && "text-red-500",
                      )}>
                        {step.label}
                      </p>
                      <p className="text-[9px] text-muted-foreground line-clamp-2">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground px-4">
                <ArrowRight className="h-5 w-5 mb-2 opacity-30" />
                <p className="text-[10px] text-center">Click a workflow card to see its steps here</p>
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      {/* ── Content ───────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b px-4 h-10 shrink-0">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-blue-500" />
            <h1 className="text-sm font-semibold">Sandbox WF</h1>
            <Badge variant="outline" className="text-[10px]">
              {S1_ITEMS.find((i) => i.key === s1Active)?.label}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{filtered.length} workflows</span>
          </div>
          {selectedWF && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => setSelectedWF(null)}
            >
              Clear selection
            </Button>
          )}
        </div>

        {/* Main content area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Running", count: stats.running, icon: Play, color: "text-green-500" },
              { label: "Completed", count: stats.completed, icon: CheckCircle2, color: "text-blue-500" },
              { label: "Failed", count: stats.failed, icon: AlertTriangle, color: "text-red-500" },
              { label: "Steps Done", count: `${stats.doneSteps}/${stats.totalSteps}`, icon: Gauge, color: "text-purple-500" },
            ].map(({ label, count, icon: Icon, color }) => (
              <Card key={label}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", color)} />
                    <div>
                      <p className="text-lg font-bold">{count}</p>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Selected workflow detail */}
          {selectedWF && (
            <Card className="mb-4 border-primary/20">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{selectedWF.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">{selectedWF.description}</p>
                  </div>
                  <Badge variant={STATUS_BADGE[selectedWF.status].variant} className="shrink-0 ml-3">
                    {STATUS_BADGE[selectedWF.status].label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedWF.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                  ))}
                </div>

                {/* Step timeline (horizontal) */}
                <div className="flex items-center gap-1 overflow-x-auto pb-2">
                  {selectedWF.steps.map((step, i) => (
                    <div key={step.key} className="flex items-center">
                      <div className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-[10px] whitespace-nowrap border",
                        step.status === "done" && "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400",
                        step.status === "running" && "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
                        step.status === "pending" && "bg-muted border-muted-foreground/20 text-muted-foreground",
                        step.status === "failed" && "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
                      )}>
                        {STEP_STATUS_ICON[step.status]}
                        <span>{step.label}</span>
                      </div>
                      {i < selectedWF.steps.length - 1 && (
                        <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 mx-0.5" />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Timer className="h-3 w-3" /> {selectedWF.updatedAgo}</span>
                  <span className="flex items-center gap-1"><Network className="h-3 w-3" /> {selectedWF.category}</span>
                  <span className="flex items-center gap-1">
                    <Gauge className="h-3 w-3" />
                    {selectedWF.steps.filter((s) => s.status === "done").length}/{selectedWF.steps.length} steps
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Workflow cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((wf) => {
              const badge = STATUS_BADGE[wf.status] || STATUS_BADGE.draft;
              const doneCount = wf.steps.filter((s) => s.status === "done").length;
              const progress = wf.steps.length > 0 ? Math.round((doneCount / wf.steps.length) * 100) : 0;
              const isSelected = selectedWF?.id === wf.id;

              return (
                <Card
                  key={wf.id}
                  className={cn(
                    "hover:border-primary/30 transition-colors cursor-pointer",
                    isSelected && "border-primary ring-1 ring-primary/20",
                  )}
                  onClick={() => setSelectedWF(isSelected ? null : wf)}
                >
                  <CardHeader className="pb-2 p-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm leading-tight">{wf.name}</CardTitle>
                      <Badge variant={badge.variant} className="text-[10px] shrink-0 ml-2">
                        {badge.label}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">{wf.description}</p>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="flex flex-wrap gap-1 mb-2">
                      {wf.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0">{tag}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                      <span>{doneCount}/{wf.steps.length} steps</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          wf.status === "failed" ? "bg-red-500" :
                          wf.status === "completed" ? "bg-green-500" :
                          wf.status === "running" ? "bg-blue-500" :
                          "bg-muted-foreground/30",
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{wf.updatedAgo}</span>
                      <span className="ml-auto capitalize opacity-60">{wf.category}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Circle className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No workflows in this category</p>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between border-t bg-card/50 px-4 h-7 text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-4">
            <span className="font-mono text-blue-500">Sandbox WF</span>
            <span>{stats.total} workflows</span>
            <span>{stats.doneSteps}/{stats.totalSteps} steps</span>
          </div>
          <div className="flex items-center gap-3">
            <span>{S1_ITEMS.find((i) => i.key === s1Active)?.label}</span>
            {selectedWF && <span className="text-primary truncate max-w-[200px]">{selectedWF.name}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
