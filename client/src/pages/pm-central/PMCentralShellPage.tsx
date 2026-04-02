/**
 * PM Central Shell Page — flex wrapper with calc(100vh - 4rem)
 */
import PMCentralShell from "@/components/pm/PMCentralShell";

export default function PMCentralShellPage() {
  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <PMCentralShell />
    </div>
  );
}
