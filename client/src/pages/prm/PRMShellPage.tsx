/**
 * PRM Shell Page — flex wrapper with calc(100vh - 4rem)
 * Cloned from PSShellPage.
 */
import PRMShell from "@/components/prm/PRMShell";

export default function PRMShellPage() {
  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <PRMShell />
    </div>
  );
}
