/**
 * AI Work Console — Shell Route Wrapper
 *
 * Single route wrapper that mounts the Double IBM Shell. All sub-
 * routes (/work-console, /work-console/new, /work-console/:id, and
 * the per-tab variants /work-console/:id/{plan,live,diffs,results,audit})
 * resolve through this single entry so the sidebar + status bar
 * stay persistent across tab transitions.
 *
 * Cloned from client/src/pages/code-studio/CodeStudioShellPage.tsx
 * per the repo's "clone only, no cross-module imports" rule.
 */
import WorkConsoleShell from "@/components/work-console/WorkConsoleShell";

export default function WorkConsoleShellPage() {
  return (
    <div className="flex -mx-6 -mt-6 overflow-hidden" style={{ height: "calc(100vh - 4rem)" }}>
      <WorkConsoleShell />
    </div>
  );
}
