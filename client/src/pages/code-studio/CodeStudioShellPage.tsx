/**
 * Code Studio Shell Page — Simple IBM Shell wrapper
 */
import CodeStudioShell from "@/components/code-studio/CodeStudioShell";

export default function CodeStudioShellPage() {
  return (
    <div className="flex -mx-6 -mt-6 overflow-hidden" style={{ height: "calc(100vh - 4rem)" }}>
      <CodeStudioShell />
    </div>
  );
}
