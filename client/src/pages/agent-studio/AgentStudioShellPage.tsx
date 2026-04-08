/**
 * AI Agent Studio — Shell Page Container
 *
 * Mirrors the Code Studio shell page pattern: a thin wrapper that establishes
 * the IBM-style flex viewport and renders the AgentStudioShell.
 */
import AgentStudioShell from "@/components/agent-studio/AgentStudioShell";

export default function AgentStudioShellPage() {
  return (
    <div className="flex -mx-6 -mt-6 overflow-hidden" style={{ height: "calc(100vh - 4rem)" }}>
      <AgentStudioShell />
    </div>
  );
}
