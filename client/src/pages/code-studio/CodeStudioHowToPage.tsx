/**
 * Code Studio — How To Page
 *
 * User-facing operational guide for Code Studio inside MyNewAp1Claude.
 * Covers platform use cases, job-to-be-done use cases, the normal
 * operating flow, and the screen layout model.
 */
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
