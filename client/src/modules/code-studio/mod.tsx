/**
 * Code Studio — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for both `/code-studio` and
 * `/code-studio/:rest*`. The platform `<Switch>` in App.tsx never
 * sees the inner paths.
 *
 * Code Studio uses the Double IBM Shell pattern (S1 module sidebar +
 * S2 OpenCode settings rail). `CodeStudioShell` already does the
 * internal view dispatch off `useLocation()` — including the special
 * S2 propagation for the OpenCode Settings page — so this entrypoint
 * just renders the shell directly. `routes.tsx` exists alongside as
 * the canonical path list for `check:module-route-inventory`.
 *
 * Surfaces owned here:
 *   - Dashboard       → /code-studio, /code-studio/dashboard
 *   - Jobs            → /code-studio/jobs, /code-studio/jobs/:id
 *   - Templates       → /code-studio/templates
 *   - Sessions        → /code-studio/sessions
 *   - Approvals       → /code-studio/approvals
 *   - Repositories    → /code-studio/repos
 *   - Agents          → /code-studio/agents
 *   - AI Catalog      → /code-studio/ai-catalog
 *   - Policies        → /code-studio/policies
 *   - Control Panel   → /code-studio/control-panel
 *   - OpenCode Settings → /code-studio/opencode-settings
 *   - How To          → /code-studio/how-to
 *
 * Constraints:
 *   - Does NOT import `MainLayout` — the platform decides outer
 *     chrome based on the manifest's `layoutMode`.
 *   - Does NOT import private code from another module.
 *   - Does NOT call another module's backend on the frontend. Port
 *     reservations and Governance enforcement remain backend-mediated.
 *
 * The legacy `/code` Monaco editor route is a SEPARATE non-RTLM
 * surface and is not mounted by this capsule.
 */

import CodeStudioShell from "./components/CodeStudioShell";

export default function CodeStudioCapsule() {
  return <CodeStudioShell />;
}
