/**
 * Agents Shell Page — flex wrapper with calc(100vh - 4rem)
 */
import AgentsShell from "@/components/agents/AgentsShell";

export default function AgentsShellPage() {
  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <AgentsShell />
    </div>
  );
}
