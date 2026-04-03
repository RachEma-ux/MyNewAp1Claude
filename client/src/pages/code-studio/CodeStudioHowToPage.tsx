/**
 * Code Studio — How To Page
 *
 * User-facing operational guide for Code Studio inside MyNewAp1Claude.
 * Covers platform use cases, job-to-be-done use cases, the normal
 * operating flow, and the screen layout model.
 */
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  Code2,
  Search,
  Bug,
  FileCode,
  GitPullRequest,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  Layout,
  PanelLeft,
  PanelRight,
  MonitorPlay,
  Workflow,
  Terminal,
  Eye,
  CheckCircle2,
  XCircle,
  History,
  Lightbulb,
  Wrench,
  FileSearch,
  Shield,
  ClipboardCheck,
  MessageSquare,
  Zap,
  FlaskConical,
  Server,
  Brain,
  Lock,
  GitBranch,
  Layers,
  Globe,
  Bell,
  Play,
  FileText,
  Activity,
  Cpu,
} from "lucide-react";

// ── Content Data ──────────────────────────────────────────────────────────────

interface UseCase {
  title: string;
  icon: React.ElementType;
  description: string;
  howTo: string;
  examplePrompt: string;
  expectedResult: string;
}

const PLATFORM_USE_CASES: UseCase[] = [
  {
    title: "Build a new standalone module shell",
    icon: Code2,
    description: "Create a new module with its own sidebar, routes, and pages following the platform's shell pattern.",
    howTo: "Open a session, describe the module name, its navigation items, and which shell pattern to follow (Simple or Double IBM Shell). Code Studio inspects existing shells for reference, then generates the sidebar, shell, page wrapper, and route wiring.",
    examplePrompt: "Create a new standalone module called 'Analytics Hub' with a Simple IBM Shell, sidebar items: Dashboard, Reports, Settings. Follow the same pattern as PM Central.",
    expectedResult: "Shell component, sidebar, page files, route entries in App.tsx, and hamburger menu integration — all matching the platform's existing conventions.",
  },
  {
    title: "Investigate an existing module before changing it",
    icon: Search,
    description: "Understand how a module works — its files, routes, data flow, and dependencies — before making any changes.",
    howTo: "Open a session and ask Code Studio to inspect the module. It reads the relevant files, traces imports and routes, and gives you a structured summary without modifying anything.",
    examplePrompt: "Inspect the Governance Center module. Show me its route structure, shell type, sidebar items, backend routers, and database tables.",
    expectedResult: "A file-by-file breakdown of the module's architecture: routes, components, tRPC routers, schema tables, and any cross-module dependencies.",
  },
  {
    title: "Trace where a behavior is implemented",
    icon: FileSearch,
    description: "Find the exact files and functions responsible for a specific behavior in the app.",
    howTo: "Describe the behavior you're looking for. Code Studio searches the codebase, follows the chain from route to component to backend, and shows you the source.",
    examplePrompt: "Where is the approval logic for permission requests implemented? Show me the frontend component, the tRPC mutation, and the database query.",
    expectedResult: "A trace from UI button click through tRPC mutation to the database query, with exact file paths and line numbers.",
  },
  {
    title: "Refactor a flow safely",
    icon: RefreshCw,
    description: "Restructure existing code without breaking behavior. Code Studio inspects first, proposes changes, and validates the result.",
    howTo: "Describe what you want to refactor and why. Code Studio reads all affected files, proposes a plan, waits for your approval on risky operations, then implements the changes.",
    examplePrompt: "Refactor the provider initialization in server/providers/init.ts to use a registry pattern instead of the current if-else chain. Don't change the external API.",
    expectedResult: "Refactored code with the same external behavior, a diff showing exactly what changed, and confirmation that existing callers are unaffected.",
  },
  {
    title: "Add a new page, route, or backend endpoint",
    icon: FileCode,
    description: "Add new frontend pages or backend API endpoints following existing conventions.",
    howTo: "Specify what to add and where it belongs. Code Studio reads existing patterns in that module, then creates the files and wiring consistent with the module's conventions.",
    examplePrompt: "Add a new page 'Analytics' to the Governance Center module at /governance/analytics. Include a tRPC query that returns audit event counts grouped by type.",
    expectedResult: "New page component, route entry, tRPC router with the query, and sidebar nav item — all following the Governance Center's existing patterns.",
  },
  {
    title: "Prepare a governed patch proposal",
    icon: GitPullRequest,
    description: "Create a well-scoped code change with full audit trail, ready for review.",
    howTo: "Describe the patch. Code Studio inspects the target area, implements the change with minimum scope, validates it, and records the session with full diff history.",
    examplePrompt: "Fix the bug where the sidebar toggle doesn't work on mobile. Only touch the affected sidebar component, preserve existing behavior on desktop.",
    expectedResult: "A focused fix with a clear diff, no unrelated changes, and a session record showing what was inspected, changed, and validated.",
  },
  {
    title: "Run a code review inside platform rules",
    icon: ShieldCheck,
    description: "Review recent changes against the repository's architectural rules and conventions.",
    howTo: "Point Code Studio at specific files or a recent change. It reads the code, checks against AGENTS.md rules, module boundaries, and naming conventions, then reports issues.",
    examplePrompt: "Review the last 3 commits. Check for cross-module imports, missing route wiring, broken naming conventions, and any scope drift.",
    expectedResult: "A structured review with pass/fail for each rule, specific file references for any violations, and suggested fixes.",
  },
  {
    title: "Produce a reusable implementation session",
    icon: History,
    description: "Create a session that captures a complete implementation pattern, reusable as a template for similar future work.",
    howTo: "Implement a feature in a session, then ask Code Studio to summarize the pattern. The session history preserves every step, making it a reference for similar tasks.",
    examplePrompt: "I just built the Double Shell for Code Studio. Summarize the implementation pattern as a reusable template: files created, shell structure, wiring steps.",
    expectedResult: "A structured pattern summary with the exact files, components, and wiring steps, stored in the session history for future reference.",
  },
];

const JOB_USE_CASES: UseCase[] = [
  {
    title: "Understand a part of the codebase before touching it",
    icon: Eye,
    description: "Get a clear picture of how a specific area works before making changes.",
    howTo: "Ask Code Studio to explain the area. It reads the files, traces dependencies, and gives you a structured explanation without changing anything.",
    examplePrompt: "Explain how the tRPC router composition works in this repo. Start from server/routers.ts and trace how sub-routers are registered.",
    expectedResult: "A clear explanation of the router tree, which sub-routers exist, how they're composed, and how the client consumes them.",
  },
  {
    title: "Find the exact source of a bug or behavior",
    icon: Bug,
    description: "Pinpoint where a specific bug or unexpected behavior originates.",
    howTo: "Describe the symptom. Code Studio searches for the relevant code, traces the execution path, and identifies the root cause with file and line references.",
    examplePrompt: "The sidebar collapses on page navigation but should stay expanded. Find where the collapse state is being reset.",
    expectedResult: "The exact file, component, and state update causing the reset, with an explanation of why it happens and where to fix it.",
  },
  {
    title: "Get a safe implementation plan before code changes",
    icon: Lightbulb,
    description: "Have Code Studio analyze and plan before writing any code.",
    howTo: "Describe what you want to build. Code Studio inspects the repo, identifies affected files, dependencies, and risks, then presents a step-by-step plan for your approval.",
    examplePrompt: "Plan how to add a notification system to the platform. Which files need to change? What new tables are needed? What are the risks?",
    expectedResult: "A plan listing: new files to create, existing files to modify, database schema changes, implementation order, and identified risks.",
  },
  {
    title: "Make a controlled code change",
    icon: Wrench,
    description: "Implement a specific change with Code Studio handling the details safely.",
    howTo: "Describe the change. Code Studio reads relevant files, implements the change, pauses for approval on risky operations (file writes, bash commands), and shows you the diff.",
    examplePrompt: "Add a 'last updated' timestamp to the Jobs table. Update the schema, the tRPC query, and the frontend table column.",
    expectedResult: "Schema migration, updated query, new table column — with a diff showing exactly what changed across all three layers.",
  },
  {
    title: "Approve or reject risky actions",
    icon: Shield,
    description: "Control what Code Studio is allowed to do. Safe reads proceed automatically; risky writes pause for your decision.",
    howTo: "When Code Studio encounters a risky action (editing a file, running a shell command, modifying data), it pauses and shows you what it wants to do. You approve once, for the session, or reject.",
    examplePrompt: "This happens automatically during any task. When you see an approval prompt, review the action and choose: approve once, approve for session, or reject.",
    expectedResult: "Full control over what changes are made. Nothing risky happens without your explicit approval. Rejected actions are logged.",
  },
  {
    title: "Review a proposed change before accepting it",
    icon: ClipboardCheck,
    description: "See the full diff and impact of any proposed change before it's finalized.",
    howTo: "After Code Studio implements a change, review the diff in the results panel. You can ask for modifications, request a different approach, or accept the result.",
    examplePrompt: "Show me the diff for the changes you just made. Highlight any files that were modified outside the original scope.",
    expectedResult: "A clear diff view showing every file changed, lines added/removed, and whether the changes stayed within the requested scope.",
  },
  {
    title: "Validate that a change is safe",
    icon: CheckCircle2,
    description: "Confirm that a change doesn't break existing functionality or violate platform rules.",
    howTo: "Ask Code Studio to validate after a change. It checks for broken imports, route collisions, type errors, module boundary violations, and architectural rule compliance.",
    examplePrompt: "Validate the changes I just approved. Check for broken imports, type errors, and any violations of AGENTS.md rules.",
    expectedResult: "A validation report: pass/fail for each check, specific issues found (if any), and confirmation that the change is safe.",
  },
  {
    title: "Continue the same work later without losing context",
    icon: MessageSquare,
    description: "Pick up where you left off. Sessions preserve full history including prompts, results, diffs, and approvals.",
    howTo: "Reopen an existing session from the Sessions panel. All previous context is preserved — Code Studio remembers what was inspected, changed, and approved.",
    examplePrompt: "Reopen session 'Add notification system' and continue from where we left off. What was the last step completed?",
    expectedResult: "Full session context restored: previous prompts, results, diffs, and approval decisions. You continue from exactly where you stopped.",
  },
];

interface FlowStep {
  label: string;
  description: string;
  icon: React.ElementType;
}

const FLOW_STEPS: FlowStep[] = [
  { label: "Open Code Studio", description: "Navigate to Code Studio from the main menu", icon: Code2 },
  { label: "Create or reopen session", description: "Start fresh or continue previous work", icon: Terminal },
  { label: "Write your task", description: "Describe what you need in natural language", icon: MessageSquare },
  { label: "Inspect first", description: "Code Studio reads and analyzes before changing anything", icon: Search },
  { label: "Approve risky actions", description: "Safe reads proceed; writes pause for your decision", icon: ShieldCheck },
  { label: "Review diff / results", description: "See exactly what changed and verify the outcome", icon: Eye },
  { label: "Refine or accept", description: "Request changes or approve the result", icon: CheckCircle2 },
  { label: "Session history + audit", description: "Everything is recorded for future reference", icon: History },
];

interface LayoutPanel {
  position: string;
  label: string;
  items: string[];
  icon: React.ElementType;
}

const LAYOUT_PANELS: LayoutPanel[] = [
  { position: "Left", label: "Context Panel", items: ["Sessions list", "Repo status", "Current branch"], icon: PanelLeft },
  { position: "Center", label: "Work Area", items: ["Prompt box", "Activity log", "Results / diff view"], icon: MonitorPlay },
  { position: "Right", label: "Governance Drawer", items: ["Approval queue", "Governance verdict", "Touched files", "Warnings"], icon: PanelRight },
  { position: "Bottom", label: "Status Bar", items: ["Connected", "Running", "Waiting approval", "Complete"], icon: Layout },
];

// ── OpenCode Role & Advantages ────────────────────────────────────────────────

interface Advantage {
  title: string;
  description: string;
  icon: React.ElementType;
}

const OPENCODE_ADVANTAGES: Advantage[] = [
  { title: "Headless API", description: "No terminal needed. The app controls everything via HTTP — sessions, messages, diffs. Any UX can be built on top.", icon: Server },
  { title: "Session Isolation", description: "Each job gets its own session. Multiple jobs run in parallel without interference. Sessions persist for later inspection.", icon: Layers },
  { title: "Built-in Agent System", description: "Ships with agents (build, plan, explore, review). The job orchestrator maps pipeline phases directly to these agents.", icon: Brain },
  { title: "Permission Control", description: "The API exposes permission requests. The governance engine intercepts dangerous operations and requires approval.", icon: Lock },
  { title: "Diff Tracking", description: "Every code change is captured as a structured diff. The app can display, approve, or revert changes with full visibility.", icon: GitBranch },
  { title: "Provider-Agnostic", description: "Supports Anthropic, OpenAI, Ollama, Google, and more. Provider/model settings flow directly from the app's config.", icon: Globe },
  { title: "Local-First", description: "Runs on 127.0.0.1. Code never leaves the device unless a remote provider is configured. Enterprise/privacy ready.", icon: Shield },
];

const VALUE_COMPARISON: { without: string; with: string }[] = [
  { without: "App manages LLM configs, providers, agents", with: "App executes real coding tasks end-to-end" },
  { without: "Users configure settings manually", with: "Settings are applied to a live runtime" },
  { without: "Job pipeline is theoretical", with: "Jobs actually run — AI writes, reviews, tests code" },
  { without: "Static dashboard", with: "Live sessions with streaming messages, diffs, permissions" },
];

// ── Walkthrough Steps ────────────────────────────────────────────────────────

interface WalkthroughStep {
  step: number;
  title: string;
  icon: React.ElementType;
  status: string;
  description: string;
  detail: string;
}

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    step: 1,
    title: "Create a Job",
    icon: FileText,
    status: "draft",
    description: "Open Code Studio Dashboard and click New Job.",
    detail: "Fill in: Title = \"Add user notifications system\", Description = \"Create a notifications table, tRPC endpoints for list/mark-read/delete, a bell icon in the header with unread badge and dropdown. Support types: info, warning, success, error.\", Agent = build. Click Create.",
  },
  {
    step: 2,
    title: "Queue the Job",
    icon: Play,
    status: "draft → queued → preparing_workspace",
    description: "Click Queue. The orchestrator picks up the job.",
    detail: "The Job Orchestrator creates an isolated workspace. The target repo is cloned/linked so all changes are sandboxed and reversible.",
  },
  {
    step: 3,
    title: "Planning Phase",
    icon: Lightbulb,
    status: "starting_session → planning",
    description: "OpenCode's plan agent explores the repo and produces a step-by-step plan.",
    detail: "The plan covers: schema table creation, tRPC router with 4 endpoints, NotificationBell component with dropdown and badge, header integration, and seed data. All based on reading the actual codebase.",
  },
  {
    step: 4,
    title: "Review & Approve Plan",
    icon: CheckCircle2,
    status: "planning → awaiting_approval",
    description: "You review the plan in the UI and add feedback.",
    detail: "Example feedback: \"Also add a toast notification when a new notification arrives. Use the existing sonner toast system.\" Click Approve with feedback. Your input is sent back to the OpenCode session.",
  },
  {
    step: 5,
    title: "Build Phase — AI Writes Code",
    icon: Code2,
    status: "awaiting_approval → building",
    description: "The build agent writes all the code. You see live streaming messages.",
    detail: "Permission requests appear for risky actions (e.g., modifying drizzle/schema.ts). The governance engine auto-approves low-risk actions (new files) and flags high-risk ones for your review. You approve or deny each one.",
  },
  {
    step: 6,
    title: "Review Phase",
    icon: Eye,
    status: "building → reviewing",
    description: "The review agent checks code quality, security, and style.",
    detail: "Structured diffs show every file changed. The reviewer catches issues like missing auth checks on mutations and fixes them in the same session. You see the full diff with syntax highlighting.",
  },
  {
    step: 7,
    title: "Testing Phase",
    icon: Activity,
    status: "reviewing → testing",
    description: "OpenCode runs type checking and verifies integration.",
    detail: "Runs tsc --noEmit, confirms no type errors, verifies the new router integrates correctly with the existing appRouter. Reports pass/fail.",
  },
  {
    step: 8,
    title: "Governance Check",
    icon: ShieldCheck,
    status: "testing → governance_check",
    description: "The Governance Engine runs automated policy rules.",
    detail: "Checks: no secrets in code, uses Drizzle ORM (no raw SQL), schema migration is additive only, naming conventions followed, auth on all mutations. Risk level: LOW. All pass — auto-approved.",
  },
  {
    step: 9,
    title: "Completed",
    icon: CheckCircle2,
    status: "governance_check → completed",
    description: "Job finished. 4 files changed, +246 lines, 4 minutes total.",
    detail: "Full history available: every message, the plan, approval, review notes, all diffs, permission decisions, and governance audit trail. About 1 minute of your active time for a feature that normally takes a full day.",
  },
  {
    step: 10,
    title: "Apply Changes",
    icon: Zap,
    status: "completed → applied",
    description: "Review final diffs and apply to your repo.",
    detail: "The notification bell appears in the header, API endpoints work, and the schema is ready for migration. You're done.",
  },
];

// ── Best Practices: OpenCode + Claude Code ───────────────────────────────────

interface BestPractice {
  title: string;
  icon: React.ElementType;
  description: string;
  example: string;
}

const TASK_ROUTING: { task: string; tool: string; why: string }[] = [
  { task: "Complex features, architecture", tool: "Claude Code", why: "Conversational, iterative, deep context" },
  { task: "Code review of recent changes", tool: "OpenCode", why: "Fresh eyes, different model catches different issues" },
  { task: "Codebase exploration & reports", tool: "OpenCode", why: "Async, read-heavy, doesn't block Claude Code" },
  { task: "Standard scaffolding (CRUD, module)", tool: "Code Studio Jobs", why: "Governed, audited, repeatable pipeline" },
  { task: "Quick edits, bug fixes, push", tool: "Claude Code", why: "Fastest path, no orchestration overhead" },
  { task: "Multi-model validation", tool: "Both", why: "Build with one, review with the other" },
];

const BEST_PRACTICES: BestPractice[] = [
  {
    title: "Second Opinion / Code Review",
    icon: Eye,
    description: "After Claude Code builds a feature, send the changes to OpenCode for review. Two different models catch different things.",
    example: "Claude Code builds → You send diff to OpenCode: \"Review these files for bugs, security, edge cases\" → Fix anything found → Push.",
  },
  {
    title: "Parallel Exploration",
    icon: Search,
    description: "While Claude Code writes code, send OpenCode to research patterns, existing implementations, or dependencies.",
    example: "Claude Code: [writing component] | OpenCode: \"How does the sidebar pattern work? List all examples.\"",
  },
  {
    title: "Governed Job Pipeline",
    icon: ShieldCheck,
    description: "For repeatable tasks, the job pipeline adds audit trail, governance checks, and reproducibility.",
    example: "Standard work (add a page, scaffold a module) where you want traceability and consistent output.",
  },
  {
    title: "Documentation & Analysis",
    icon: FileText,
    description: "OpenCode excels at reading the whole codebase and producing structured reports — read-heavy, no file edits needed.",
    example: "\"Audit all pages missing error handling\" or \"List all tRPC endpoints lacking input validation.\"",
  },
  {
    title: "Test Prompts Before Automation",
    icon: FlaskConical,
    description: "Before wiring a prompt into the job pipeline, test it interactively via the API. If the output is good, it becomes a reusable job template.",
    example: "POST /session/{id}/message → \"Add a last-updated column to code_jobs\" → review result → save as template.",
  },
];

// ── Page Component ───────────────────────────────────────────────────────────

export default function CodeStudioHowToPage() {
  return (
    <div className="p-4 space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-violet-500" /> How To Use Code Studio
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          A practical guide to using Code Studio — the standalone coding module inside MyNewAp1Claude.
          Code Studio uses OpenCode as its coding-workflow engine: you write natural-language tasks,
          the system inspects and plans first, pauses for approval on risky actions, and gives you
          full control over every change.
        </p>
      </div>

      <Separator />

      {/* ── What Is OpenCode ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-violet-500" /> What Is OpenCode?
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          OpenCode is an <strong>AI coding agent</strong> that runs as a <strong>headless HTTP server</strong>.
          Instead of a human typing in a terminal, Code Studio talks to it programmatically via REST API.
          It is the <strong>execution engine</strong> behind Code Studio — the app is the control plane
          (manage, configure, govern); OpenCode is the runtime (do the actual coding work).
        </p>
        <pre className="text-[10px] text-muted-foreground font-mono bg-muted/30 rounded-lg p-3 overflow-x-auto">{`User → Code Studio UI → Job Orchestrator → OpenCode API → AI writes code
              ↑                                        ↓
       governance, approval                 diffs, messages, results`}</pre>

        {/* Value comparison */}
        <div className="mt-4 mb-4">
          <h3 className="text-xs font-semibold mb-2">Added Value</h3>
          <div className="grid grid-cols-2 gap-0 text-[10px] border rounded-md overflow-hidden">
            <div className="bg-muted/40 px-2 py-1.5 font-semibold border-b">Without OpenCode</div>
            <div className="bg-muted/40 px-2 py-1.5 font-semibold border-b border-l">With OpenCode</div>
            {VALUE_COMPARISON.map((row, i) => (
              <React.Fragment key={i}>
                <div className="px-2 py-1.5 text-muted-foreground border-b last:border-b-0">{row.without}</div>
                <div className="px-2 py-1.5 border-l border-b last:border-b-0 font-medium">{row.with}</div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Advantages */}
        <h3 className="text-xs font-semibold mb-2">Key Advantages</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {OPENCODE_ADVANTAGES.map((adv) => (
            <Card key={adv.title}>
              <CardContent className="p-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <adv.icon className="h-3.5 w-3.5 text-violet-500 opacity-70 shrink-0" />
                  <span className="text-xs font-medium">{adv.title}</span>
                </div>
                <p className="text-[10px] text-muted-foreground pl-5">{adv.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Real-World Walkthrough ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Bell className="h-4 w-4 text-violet-500" /> Real-World Walkthrough
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          End-to-end scenario: <strong>"Add a Notifications System"</strong> — from job creation to shipped feature in 4 minutes.
        </p>
        <div className="space-y-2">
          {WALKTHROUGH_STEPS.map((ws) => (
            <Card key={ws.step}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/10 shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-violet-500">{ws.step}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ws.icon className="h-3.5 w-3.5 text-violet-500 opacity-70 shrink-0" />
                      <span className="text-xs font-medium">{ws.title}</span>
                      <Badge variant="outline" className="text-[9px] px-1 h-4 font-mono">{ws.status}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{ws.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 pl-0 border-l-2 border-violet-500/20 ml-0 pl-2">{ws.detail}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Summary table */}
        <Card className="mt-3">
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold mb-2">Summary</h3>
            <div className="grid grid-cols-3 gap-0 text-[10px] border rounded-md overflow-hidden">
              <div className="bg-muted/40 px-2 py-1 font-semibold border-b">Phase</div>
              <div className="bg-muted/40 px-2 py-1 font-semibold border-b border-l">Who</div>
              <div className="bg-muted/40 px-2 py-1 font-semibold border-b border-l">Time</div>
              {[
                ["Define the task", "You (30 sec)", "0:00"],
                ["Plan implementation", "Plan agent", "0:30"],
                ["Review & approve", "You (20 sec)", "1:00"],
                ["Write all code", "Build agent", "1:20"],
                ["Approve permissions", "You (10 sec)", "2:30"],
                ["Review code quality", "Review agent", "2:40"],
                ["Run type checks", "Test agent", "3:20"],
                ["Governance audit", "Governance engine", "3:40"],
                ["Done", "—", "4:00"],
              ].map(([phase, who, time], i) => (
                <React.Fragment key={i}>
                  <div className="px-2 py-1 border-b last:border-b-0">{phase}</div>
                  <div className="px-2 py-1 border-l border-b last:border-b-0 text-muted-foreground">{who}</div>
                  <div className="px-2 py-1 border-l border-b last:border-b-0 font-mono">{time}</div>
                </React.Fragment>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              <strong>The key insight:</strong> You didn't write code. You described intent, approved a plan,
              supervised execution, and reviewed results. The app handled orchestration, governance, and audit.
              OpenCode handled the coding. The shift: from <em>writing code</em> to <em>directing AI that
              writes code</em>, with full control and traceability at every step.
            </p>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* ── Best Practices: OpenCode + Claude Code ─────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Zap className="h-4 w-4 text-violet-500" /> Best Practices: OpenCode + Claude Code
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Two AI tools, each with unique strengths. Use each where it adds value, not where it duplicates effort.
        </p>

        {/* Task routing table */}
        <Card className="mb-3">
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold mb-2">Task Routing Guide</h3>
            <div className="grid grid-cols-3 gap-0 text-[10px] border rounded-md overflow-hidden">
              <div className="bg-muted/40 px-2 py-1.5 font-semibold border-b">Task Type</div>
              <div className="bg-muted/40 px-2 py-1.5 font-semibold border-b border-l">Best Tool</div>
              <div className="bg-muted/40 px-2 py-1.5 font-semibold border-b border-l">Why</div>
              {TASK_ROUTING.map((row, i) => (
                <React.Fragment key={i}>
                  <div className="px-2 py-1.5 border-b last:border-b-0">{row.task}</div>
                  <div className="px-2 py-1.5 border-l border-b last:border-b-0 font-medium">{row.tool}</div>
                  <div className="px-2 py-1.5 border-l border-b last:border-b-0 text-muted-foreground">{row.why}</div>
                </React.Fragment>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Practice cards */}
        <div className="space-y-2">
          {BEST_PRACTICES.map((bp) => (
            <Card key={bp.title}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <bp.icon className="h-3.5 w-3.5 text-violet-500 opacity-70 shrink-0" />
                  <span className="text-xs font-medium">{bp.title}</span>
                </div>
                <p className="text-[10px] text-muted-foreground pl-5">{bp.description}</p>
                <div className="mt-1.5 pl-5">
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Example</span>
                  <p className="text-[10px] font-mono bg-muted/30 rounded px-2 py-1 mt-0.5">{bp.example}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Power move */}
        <Card className="mt-3 border-violet-500/30">
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold mb-1 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-violet-500" /> The Power Move: Build → Review → Ship
            </h3>
            <div className="space-y-1 pl-5 text-[10px]">
              <div className="flex items-center gap-2"><Badge variant="outline" className="text-[9px] w-4 h-4 p-0 justify-center shrink-0">1</Badge> You tell Claude Code what to build</div>
              <div className="flex items-center gap-2"><Badge variant="outline" className="text-[9px] w-4 h-4 p-0 justify-center shrink-0">2</Badge> Claude Code writes the code, commits</div>
              <div className="flex items-center gap-2"><Badge variant="outline" className="text-[9px] w-4 h-4 p-0 justify-center shrink-0">3</Badge> You send the diff to OpenCode: "Review this for issues"</div>
              <div className="flex items-center gap-2"><Badge variant="outline" className="text-[9px] w-4 h-4 p-0 justify-center shrink-0">4</Badge> OpenCode reports back</div>
              <div className="flex items-center gap-2"><Badge variant="outline" className="text-[9px] w-4 h-4 p-0 justify-center shrink-0">5</Badge> Claude Code fixes anything found</div>
              <div className="flex items-center gap-2"><Badge variant="outline" className="text-[9px] w-4 h-4 p-0 justify-center shrink-0">6</Badge> You push</div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 pl-5">
              Two AI models, two perspectives, one codebase. You are the decision-maker in the middle.
            </p>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* ── Normal Operating Flow ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Workflow className="h-4 w-4 text-violet-500" /> Normal Operating Flow
        </h2>
        <div className="grid gap-1.5">
          {FLOW_STEPS.map((step, i) => (
            <div key={i} className="flex items-start gap-3 py-1.5 px-3 rounded-md bg-muted/20">
              <div className="flex items-center gap-2 shrink-0 w-5">
                <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
              </div>
              <step.icon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-violet-500 opacity-70" />
              <div className="min-w-0">
                <span className="text-xs font-medium">{step.label}</span>
                <span className="text-xs text-muted-foreground ml-2">{step.description}</span>
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/40" />
              )}
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Screen Layout Model ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Layout className="h-4 w-4 text-violet-500" /> Screen Layout
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LAYOUT_PANELS.map((panel) => (
            <Card key={panel.position}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <panel.icon className="h-3.5 w-3.5 text-violet-500 opacity-70" />
                  <span className="text-xs font-medium">{panel.position}</span>
                  <Badge variant="outline" className="text-[9px] px-1 h-4">{panel.label}</Badge>
                </div>
                <ul className="space-y-0.5">
                  {panel.items.map((item) => (
                    <li key={item} className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
        <pre className="text-[10px] text-muted-foreground font-mono bg-muted/30 rounded-lg p-3 mt-3 overflow-x-auto">{`┌──────────┬──────────────────────┬──────────┐
│          │                      │          │
│ Sessions │     Prompt / Work    │ Approvals│
│ Repo     │     Results / Diff   │ Govern.  │
│ Branch   │     Activity Log     │ Files    │
│          │                      │ Warnings │
├──────────┴──────────────────────┴──────────┤
│  Connected │ Running │ Waiting │ Complete   │
└──────────────────────────────────────────────┘`}</pre>
      </section>

      <Separator />

      {/* ── MyNewAp1Claude Use Cases ───────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Code2 className="h-4 w-4 text-violet-500" /> MyNewAp1Claude Use Cases
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          The main ways Code Studio is used inside the platform.
        </p>
        <div className="space-y-3">
          {PLATFORM_USE_CASES.map((uc) => (
            <UseCaseCard key={uc.title} useCase={uc} />
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Job-to-be-Done Use Cases ──────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-violet-500" /> Job-to-be-Done Use Cases
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          The practical jobs you hire Code Studio to do.
        </p>
        <div className="space-y-3">
          {JOB_USE_CASES.map((uc) => (
            <UseCaseCard key={uc.title} useCase={uc} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Use Case Card ────────────────────────────────────────────────────────────

function UseCaseCard({ useCase }: { useCase: UseCase }) {
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <useCase.icon className="h-3.5 w-3.5 text-violet-500 opacity-70 shrink-0" />
          <span className="text-xs font-medium">{useCase.title}</span>
        </div>
        <p className="text-[10px] text-muted-foreground">{useCase.description}</p>
        <div className="grid gap-1.5 pl-5">
          <div>
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">How to</span>
            <p className="text-[10px] text-muted-foreground">{useCase.howTo}</p>
          </div>
          <div>
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Example prompt</span>
            <p className="text-[10px] font-mono bg-muted/30 rounded px-2 py-1 mt-0.5">{useCase.examplePrompt}</p>
          </div>
          <div>
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Expected result</span>
            <p className="text-[10px] text-muted-foreground">{useCase.expectedResult}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
