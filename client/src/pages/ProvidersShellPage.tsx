/**
 * Providers Shell Page — flex wrapper with calc(100vh - 4rem)
 * Cloned from PSWizardPage / AITypesShell pattern.
 */
import ProvidersShell from "@/components/providers/ProvidersShell";

export default function ProvidersShellPage() {
  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <ProvidersShell />
    </div>
  );
}
