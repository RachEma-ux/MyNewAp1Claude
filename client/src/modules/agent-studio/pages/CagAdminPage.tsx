/**
 * CAG Admin page — no-deferral continuation-33 slice 132.
 *
 * Global Agent Studio page reachable at `/agent-studio/cag-admin`.
 * Closes the partial-consumer gap on cag.{listPacks, refreshPack,
 * listPackEvents} — the 3 unconsumed endpoints on top of the existing
 * CagPackPanel consumers (getLatestPack + previewInjectedContext).
 */

import { Database } from "lucide-react";

import { PageHeader } from "../components/ui";
import { CagAdminPanel } from "../components/CagAdminPanel";

export default function CagAdminPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="CAG Admin"
        subtitle="Operator surface for CAG capability pack lifecycle: list packs for an agent, force a governed refresh, and browse recent pack events."
        icon={<Database className="h-5 w-5" />}
      />
      <CagAdminPanel />
    </div>
  );
}
