/**
 * LLM Shell Page — flex wrapper with calc(100vh - 4rem)
 */
import LLMShell from "@/components/llm/LLMShell";

export default function LLMShellPage() {
  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <LLMShell />
    </div>
  );
}
