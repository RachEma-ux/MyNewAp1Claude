/**
 * PS Control Panel — Matrix Admin Surface
 *
 * Layout cloned from PmCentralSidebarLayout (no cross-module import).
 * Pattern: "flex -mx-6 -mt-6 overflow-hidden" with calc(100vh - 4rem).
 *
 * All tab content + state is now in PSControlPanelShell (Fragment pattern).
 */
import { PSControlPanelShell } from "../components/control-panel/PSControlPanelShell";

// Re-export for backwards compatibility (child tabs import from here)
export { PSVersionSelector } from "../components/control-panel/PSVersionSelector";

// ── Main Component ───────────────────────────────────────────────────

export function PSControlPanelPage() {
  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <PSControlPanelShell />
    </div>
  );
}

export default PSControlPanelPage;
