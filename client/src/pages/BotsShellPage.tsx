/**
 * Bots Shell Page — flex wrapper with calc(100vh - 4rem)
 */
import BotsShell from "@/components/bots/BotsShell";

export default function BotsShellPage() {
  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <BotsShell />
    </div>
  );
}
