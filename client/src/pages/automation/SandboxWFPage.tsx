/**
 * Sandbox WF — Landing page (Simple IBM Shell)
 *
 * Single sidebar with 3 sections:
 *   1. Sandbox Tools (top) — switches content panel
 *   2. Categories (middle) — filters workflow list
 *   3. By Status (bottom) — status filter
 *
 * Simple Shell pattern (cloned from PmCentralSidebarLayout):
 *   - "flex -mx-6 -mt-6 overflow-hidden" + calc(100vh - 4rem)
 *   - Sidebar: w-12 collapsed (icon-only) / w-56 expanded
 *   - Single toggle, collapsed on mobile
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
  Zap,
  Clock,
  BarChart3,
  Shield,
  Brain,
  Plug,
  WifiOff,
  LayoutDashboard,
  Eye,
  Gauge,
  Loader2,
  ChevronRight,
  Timer,
  Network,
  FileCode,
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

// ── Sidebar sections ─────────────────────────────────────

const TOOLS = [
  { key: "editor", label: "WF Editor", icon: GitBranch, color: "text-blue-400" },
  { key: "triggers", label: "Triggers", icon: Zap, color: "text-yellow-400" },
  { key: "debug", label: "Debug Console", icon: Eye, color: "text-orange-400" },
  { key: "deploy", label: "Deploy", icon: Gauge, color: "text-green-400" },
  { key: "metrics", label: "Metrics", icon: BarChart3, color: "text-purple-400" },
];

const CATEGORIES = [
  { key: "all", label: "All Workflows", icon: Layers },
  { key: "decision", label: "Decision Engine", icon: GitBranch },
  { key: "integration", label: "Integrations", icon: Plug },
  { key: "ai", label: "AI Intelligence", icon: Brain },
  { key: "governance", label: "Governance", icon: Shield },
  { key: "offline", label: "Offline Exec", icon: WifiOff },
  { key: "canvas", label: "Canvas Builder", icon: LayoutDashboard },
];

const STATUSES = [
  { key: "running", label: "Running", icon: Play, color: "text-green-500" },
  { key: "completed", label: "Completed", icon: CheckCircle2, color: "text-blue-500" },
  { key: "failed", label: "Failed", icon: AlertTriangle, color: "text-red-500" },
  { key: "draft", label: "Drafts", icon: FileCode, color: "text-muted-foreground" },
];

// ── Workflows — derived from AppDescription + AppDesign ──

const WORKFLOWS: WFWorkflow[] = [
  {
    id: 1, name: "Approval Routing Engine", category: "decision", status: "running",
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
    id: 2, name: "Scoring & Prioritization Pipeline", category: "decision", status: "completed",
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
    id: 3, name: "Multi-System Integration Sync", category: "integration", status: "running",
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
    id: 4, name: "Git/Jira Developer Workflow", category: "integration", status: "completed",
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
    id: 5, name: "RAG Document Processing Pipeline", category: "ai", status: "running",
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
    id: 6, name: "AI-Driven Decision Routing", category: "ai", status: "completed",
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
    id: 7, name: "Compliance Audit Trail Generator", category: "governance", status: "completed",
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
    id: 8, name: "Version-Safe Rule Deployment", category: "governance", status: "draft",
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
    id: 9, name: "Offline Workflow Execution", category: "offline", status: "running",
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
    id: 10, name: "Infinite Canvas Workflow Builder", category: "canvas", status: "draft",
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
    id: 11, name: "Visio Import & Conversion", category: "canvas", status: "failed",
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
    id: 12, name: "ETL Data Orchestration Pipeline", category: "integration", status: "completed",
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

// ── Sidebar NavItem ──────────────────────────────────────

function NavItem({ icon, label, active, collapsed, count, color, onClick }: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  count?: number;
  color?: string;
  onClick: () => void;
}) {
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        title={label}
        className={cn(
          "flex items-center justify-center w-full py-1.5 rounded-sm transition-colors",
          active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        )}
      >
        <span className={cn("opacity-70", color)}>{icon}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm transition-colors",
        active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
      )}
    >
      <span className={cn("shrink-0 opacity-70", color)}>{icon}</span>
      <span className="truncate flex-1 text-left">{label}</span>
      {count !== undefined && <span className="text-[10px] opacity-60">{count}</span>}
    </button>
  );
}

// ── Main Component ───────────────────────────────────────

export default function SandboxWFPage() {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [activeTool, setActiveTool] = useState("editor");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [selectedWF, setSelectedWF] = useState<WFWorkflow | null>(null);
  const collapsed = sidebarCollapsed;

  // Filter workflows
  const filtered = useMemo(() => {
    let wfs = WORKFLOWS;
    if (activeCategory !== "all") wfs = wfs.filter((w) => w.category === activeCategory);
    if (activeStatus) wfs = wfs.filter((w) => w.status === activeStatus);
    return wfs;
  }, [activeCategory, activeStatus]);

  // Stats
  const stats = useMemo(() => ({
    running: WORKFLOWS.filter((w) => w.status === "running").length,
    completed: WORKFLOWS.filter((w) => w.status === "completed").length,
    failed: WORKFLOWS.filter((w) => w.status === "failed").length,
    draft: WORKFLOWS.filter((w) => w.status === "draft").length,
    total: WORKFLOWS.length,
    totalSteps: WORKFLOWS.reduce((a, w) => a + w.steps.length, 0),
    doneSteps: WORKFLOWS.reduce((a, w) => a + w.steps.filter((s) => s.status === "done").length, 0),
  }), []);

  // Click handler: select + auto-collapse on mobile
  const handleToolClick = (key: string) => { setActiveTool(key); if (isMobile) setSidebarCollapsed(true); };
  const handleCategoryClick = (key: string) => { setActiveCategory(key); setActiveStatus(null); setSelectedWF(null); setActiveTool("editor"); if (isMobile) setSidebarCollapsed(true); };
  const handleStatusClick = (key: string) => { setActiveStatus(activeStatus === key ? null : key); setActiveCategory("all"); setSelectedWF(null); setActiveTool("editor"); if (isMobile) setSidebarCollapsed(true); };

  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      {/* ── Sidebar ──────────────────────────────────── */}
      <div
        className={cn(
          "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
          collapsed ? "w-12" : "w-56",
        )}
      >
        {/* Header + toggle */}
        <div className={cn(
          "flex items-center border-b shrink-0",
          collapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5",
        )}>
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <Workflow className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span className="text-xs font-semibold text-muted-foreground truncate">Sandbox WF</span>
            </div>
          )}
          <Button
            variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className={collapsed ? "px-1 py-1" : "py-1"}>
            {/* Section 1: Sandbox Tools */}
            {!collapsed && (
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sandbox Tools
              </div>
            )}
            {TOOLS.map(({ key, label, icon: Icon, color }) => (
              <NavItem
                key={key}
                icon={<Icon className="h-3.5 w-3.5" />}
                label={label}
                active={activeTool === key}
                collapsed={collapsed}
                color={activeTool === key ? undefined : color}
                onClick={() => handleToolClick(key)}
              />
            ))}

            <Separator className="my-1.5" />

            {/* Section 2: Categories */}
            {!collapsed && (
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Categories
              </div>
            )}
            {CATEGORIES.map(({ key, label, icon: Icon }) => {
              const count = key === "all" ? WORKFLOWS.length : WORKFLOWS.filter((w) => w.category === key).length;
              return (
                <NavItem
                  key={key}
                  icon={<Icon className="h-3.5 w-3.5" />}
                  label={label}
                  active={activeCategory === key && !activeStatus}
                  collapsed={collapsed}
                  count={count}
                  onClick={() => handleCategoryClick(key)}
                />
              );
            })}

            <Separator className="my-1.5" />

            {/* Section 3: By Status */}
            {!collapsed && (
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                By Status
              </div>
            )}
            {STATUSES.map(({ key, label, icon: Icon, color }) => {
              const count = WORKFLOWS.filter((w) => w.status === key).length;
              return (
                <NavItem
                  key={key}
                  icon={<Icon className="h-3.5 w-3.5" />}
                  label={label}
                  active={activeStatus === key}
                  collapsed={collapsed}
                  count={count}
                  color={color}
                  onClick={() => handleStatusClick(key)}
                />
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* ── Content ───────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b px-4 h-10 shrink-0">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-blue-500" />
            <h1 className="text-sm font-semibold">Sandbox WF</h1>
            <Badge variant="outline" className="text-[10px]">
              {CATEGORIES.find((c) => c.key === activeCategory)?.label}
            </Badge>
            {activeStatus && (
              <Badge variant="secondary" className="text-[10px] capitalize">{activeStatus}</Badge>
            )}
            <span className="text-[10px] text-muted-foreground">{filtered.length} workflows</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {TOOLS.find((t) => t.key === activeTool)?.label}
            </Badge>
            {selectedWF && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setSelectedWF(null)}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Main content — switches based on activeTool */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">

          {/* ═══ WF Editor ═══ */}
          {activeTool === "editor" && (
            <>
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((wf) => {
                  const badge = STATUS_BADGE[wf.status] || STATUS_BADGE.draft;
                  const doneCount = wf.steps.filter((s) => s.status === "done").length;
                  const progress = wf.steps.length > 0 ? Math.round((doneCount / wf.steps.length) * 100) : 0;
                  const isSelected = selectedWF?.id === wf.id;
                  return (
                    <Card key={wf.id} className={cn("hover:border-primary/30 transition-colors cursor-pointer", isSelected && "border-primary ring-1 ring-primary/20")} onClick={() => setSelectedWF(isSelected ? null : wf)}>
                      <CardHeader className="pb-2 p-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-sm leading-tight">{wf.name}</CardTitle>
                          <Badge variant={badge.variant} className="text-[10px] shrink-0 ml-2">{badge.label}</Badge>
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
                          <div className={cn("h-full rounded-full transition-all", wf.status === "failed" ? "bg-red-500" : wf.status === "completed" ? "bg-green-500" : wf.status === "running" ? "bg-blue-500" : "bg-muted-foreground/30")} style={{ width: `${progress}%` }} />
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" /><span>{wf.updatedAgo}</span>
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
                  <p className="text-sm">No workflows match this filter</p>
                </div>
              )}
            </>
          )}

          {/* ═══ Triggers ═══ */}
          {activeTool === "triggers" && (
            <>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-500" /> Triggers</h2>
              <div className="space-y-2">
                {[
                  { name: "Webhook — POST /api/trigger/ingest", type: "HTTP", status: "active", fires: 342, wf: "Data Ingestion Pipeline" },
                  { name: "Cron — Every day at 02:00 UTC", type: "Schedule", status: "active", fires: 89, wf: "ETL Data Orchestration Pipeline" },
                  { name: "Jira Issue Created (PROJ-*)", type: "Webhook", status: "active", fires: 156, wf: "Git/Jira Developer Workflow" },
                  { name: "Document Upload Event", type: "Event", status: "active", fires: 78, wf: "RAG Document Processing Pipeline" },
                  { name: "Network Disconnect Detected", type: "System", status: "active", fires: 12, wf: "Offline Workflow Execution" },
                  { name: "Compliance Report — Monthly", type: "Schedule", status: "active", fires: 6, wf: "Compliance Audit Trail Generator" },
                  { name: "Manual — User-Initiated", type: "Manual", status: "paused", fires: 0, wf: "Version-Safe Rule Deployment" },
                  { name: "AI Confidence < 0.8", type: "Condition", status: "active", fires: 23, wf: "AI-Driven Decision Routing" },
                ].map((t, i) => (
                  <Card key={i}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div><p className="text-xs font-medium">{t.name}</p><p className="text-[10px] text-muted-foreground mt-0.5">Fires → <span className="text-foreground">{t.wf}</span></p></div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <Badge variant="outline" className="text-[9px]">{t.type}</Badge>
                          <Badge variant={t.status === "active" ? "default" : "secondary"} className="text-[9px]">{t.status}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground"><span>{t.fires} total fires</span></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* ═══ Debug Console ═══ */}
          {activeTool === "debug" && (
            <>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Eye className="h-4 w-4 text-orange-500" /> Debug Console</h2>
              <Card><CardContent className="p-0">
                <div className="bg-zinc-950 rounded-lg p-3 font-mono text-[11px] leading-relaxed max-h-[60vh] overflow-y-auto">
                  {[
                    { ts: "14:23:01.342", level: "INFO", msg: "[ApprovalEngine] Request #4821 ingested — amount: $45,200, category: procurement" },
                    { ts: "14:23:01.345", level: "INFO", msg: "[RiskClassifier] Scoring request #4821 against decision table v3.2" },
                    { ts: "14:23:01.401", level: "INFO", msg: "[RiskClassifier] Result: HIGH (score: 0.82) — routing to senior approver" },
                    { ts: "14:23:01.412", level: "INFO", msg: "[ApprovalRouter] Selected approver: Sarah Chen (VP Finance, threshold: $50K)" },
                    { ts: "14:23:01.450", level: "WAIT", msg: "[ApprovalGate] Awaiting human review — SLA deadline: 2h" },
                    { ts: "14:23:05.112", level: "INFO", msg: "[IntegrationSync] Sync batch started — 5 connectors active" },
                    { ts: "14:23:05.234", level: "INFO", msg: "[Salesforce] Delta query: 142 records modified since last sync" },
                    { ts: "14:23:05.567", level: "INFO", msg: "[SAP] Pulling PO data — 89 new entries" },
                    { ts: "14:23:06.012", level: "WARN", msg: "[Jira] Rate limit warning — 4,200/5,000 requests used this hour" },
                    { ts: "14:23:08.445", level: "INFO", msg: "[RAGPipeline] Document #1847 ingested — 24 chunks, generating embeddings" },
                    { ts: "14:23:08.890", level: "INFO", msg: "[Embeddings] Batch encode: 342/500 chunks complete (68%)" },
                    { ts: "14:23:09.112", level: "INFO", msg: "[OfflineEngine] Network status: ONLINE — sync queue empty" },
                    { ts: "14:23:10.001", level: "ERROR", msg: "[VisioImport] Layout failed: circular dependency (nodes 7→3→9→7)" },
                    { ts: "14:23:10.003", level: "INFO", msg: "[VisioImport] Flagged for human review — workflow paused at step 5/6" },
                    { ts: "14:23:12.567", level: "INFO", msg: "[ETLPipeline] Batch complete — 2.3M rows loaded, quality: 99.7%" },
                    { ts: "14:23:15.890", level: "INFO", msg: "[AIRouter] Request classified: intent=escalation, confidence=0.94" },
                    { ts: "14:23:15.920", level: "INFO", msg: "[AIRouter] RAG context: 3 relevant policies found (cosine > 0.85)" },
                    { ts: "14:23:16.100", level: "INFO", msg: "[ComplianceAudit] Daily report — 847 events, 0 policy violations" },
                  ].map((log, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-zinc-500 shrink-0">{log.ts}</span>
                      <span className={cn("shrink-0 w-12", log.level === "ERROR" && "text-red-400", log.level === "WARN" && "text-yellow-400", log.level === "WAIT" && "text-blue-400", log.level === "INFO" && "text-green-400")}>{log.level}</span>
                      <span className="text-zinc-300">{log.msg}</span>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-1"><span className="text-zinc-500">14:23:16.200</span><span className="text-green-400 animate-pulse">_</span></div>
                </div>
              </CardContent></Card>
            </>
          )}

          {/* ═══ Deploy ═══ */}
          {activeTool === "deploy" && (
            <>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Gauge className="h-4 w-4 text-green-500" /> Deploy</h2>
              <div className="space-y-3">
                {WORKFLOWS.map((wf) => {
                  const doneCount = wf.steps.filter((s) => s.status === "done").length;
                  const canDeploy = wf.status === "completed" || wf.status === "draft";
                  const isDeployed = wf.status === "running" || wf.status === "completed";
                  return (
                    <Card key={wf.id}><CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0"><p className="text-xs font-medium truncate">{wf.name}</p><p className="text-[10px] text-muted-foreground">{doneCount}/{wf.steps.length} steps · {wf.category}</p></div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {isDeployed && <Badge variant="default" className="text-[9px] bg-green-600">Deployed</Badge>}
                          {wf.status === "draft" && <Badge variant="outline" className="text-[9px]">Draft</Badge>}
                          {wf.status === "failed" && <Badge variant="destructive" className="text-[9px]">Failed</Badge>}
                          <Button variant={canDeploy ? "default" : "outline"} size="sm" className="h-6 text-[10px] px-2" disabled={!canDeploy}>
                            {wf.status === "completed" ? "Redeploy" : wf.status === "draft" ? "Deploy" : wf.status === "running" ? "Live" : "Fix First"}
                          </Button>
                        </div>
                      </div>
                    </CardContent></Card>
                  );
                })}
              </div>
            </>
          )}

          {/* ═══ Metrics ═══ */}
          {activeTool === "metrics" && (
            <>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-purple-500" /> Metrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Total Workflows", value: stats.total },
                  { label: "Total Steps", value: stats.totalSteps },
                  { label: "Steps Completed", value: stats.doneSteps },
                  { label: "Completion Rate", value: `${Math.round((stats.doneSteps / stats.totalSteps) * 100)}%` },
                  { label: "Avg Steps/WF", value: (stats.totalSteps / stats.total).toFixed(1) },
                  { label: "Categories", value: CATEGORIES.length - 1 },
                ].map(({ label, value }) => (
                  <Card key={label}><CardContent className="p-3 text-center"><p className="text-lg font-bold">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></CardContent></Card>
                ))}
              </div>
              <h3 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">By Category</h3>
              <div className="space-y-2 mb-4">
                {CATEGORIES.filter((c) => c.key !== "all").map(({ key, label, icon: Icon }) => {
                  const catWFs = WORKFLOWS.filter((w) => w.category === key);
                  const catSteps = catWFs.reduce((a, w) => a + w.steps.length, 0);
                  const catDone = catWFs.reduce((a, w) => a + w.steps.filter((s) => s.status === "done").length, 0);
                  const pct = catSteps > 0 ? Math.round((catDone / catSteps) * 100) : 0;
                  return (
                    <Card key={key}><CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs font-medium">{label}</span></div>
                        <span className="text-xs text-muted-foreground">{catWFs.length} WFs · {catDone}/{catSteps} · {pct}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${pct}%` }} /></div>
                    </CardContent></Card>
                  );
                })}
              </div>
              <h3 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Per Workflow</h3>
              <Card><CardContent className="p-0"><div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="p-2 font-medium">Workflow</th><th className="p-2 font-medium">Category</th><th className="p-2 font-medium">Status</th><th className="p-2 font-medium">Steps</th><th className="p-2 font-medium">Progress</th>
                  </tr></thead>
                  <tbody>
                    {WORKFLOWS.map((wf) => {
                      const done = wf.steps.filter((s) => s.status === "done").length;
                      const pct = Math.round((done / wf.steps.length) * 100);
                      return (
                        <tr key={wf.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-2 font-medium">{wf.name}</td>
                          <td className="p-2 capitalize text-muted-foreground">{wf.category}</td>
                          <td className="p-2"><Badge variant={STATUS_BADGE[wf.status].variant} className="text-[9px]">{STATUS_BADGE[wf.status].label}</Badge></td>
                          <td className="p-2 text-muted-foreground">{done}/{wf.steps.length}</td>
                          <td className="p-2"><div className="flex items-center gap-2"><div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden"><div className={cn("h-full rounded-full", wf.status === "failed" ? "bg-red-500" : wf.status === "completed" ? "bg-green-500" : "bg-blue-500")} style={{ width: `${pct}%` }} /></div><span className="text-muted-foreground">{pct}%</span></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div></CardContent></Card>
            </>
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
            <span>{TOOLS.find((t) => t.key === activeTool)?.label}</span>
            {selectedWF && <span className="text-primary truncate max-w-[200px]">{selectedWF.name}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
