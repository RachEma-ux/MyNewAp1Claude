/**
 * PS Shell Page — flex wrapper with calc(100vh - 4rem)
 */
import PSShell from "@/components/projects-system/PSShell";

export default function PSShellPage() {
  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <PSShell />
    </div>
  );
}
