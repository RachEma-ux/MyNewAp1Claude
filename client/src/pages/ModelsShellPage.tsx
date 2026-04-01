/**
 * Models Shell Page — flex wrapper with calc(100vh - 4rem)
 */
import ModelsShell from "@/components/models/ModelsShell";

export default function ModelsShellPage() {
  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <ModelsShell />
    </div>
  );
}
