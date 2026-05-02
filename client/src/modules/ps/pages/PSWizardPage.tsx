/**
 * PS Wizard — 11-step flow page
 *
 * Layout cloned from PmCentralSidebarLayout (no cross-module import).
 * Pattern: "flex -mx-6 -mt-6 overflow-hidden" with calc(100vh - 4rem).
 *
 * All wizard state + step content is in PSWizardShell (Fragment pattern).
 */
import { PSWizardShell } from "../components/wizard/PSWizardShell";

export default function PSWizardPage() {
  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <PSWizardShell />
    </div>
  );
}
