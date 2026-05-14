// VaultAttachmentsAdminSurface — V1+ Phase 15-δ composition slice
// (PR-V1-66).
//
// Composes the two atomic 15-δ Phase G panels into a single per-vault
// admin surface:
//
//   AttachmentQuotaPanel  (#816) — quota header (used / limit / %)
//   AttachmentListPanel   (#796) — paginated list of attachment rows
//
// Single-responsibility composition shell — no business logic, no
// extra fetches; each child panel owns its own tRPC query. Mirrors
// the way #814 CanvasProjectionEventsDrainStatusPanel sits inside an
// operator surface: extract the composition into a small focused
// component with its own JSDOM test, so the eventual route/page
// (e.g. an Agent Studio Shell view or a dedicated /vaults/:id
// admin URL) is just `<VaultAttachmentsAdminSurface vaultId={…} />`.

import { AttachmentQuotaPanel } from "./AttachmentQuotaPanel";
import { AttachmentListPanel } from "./AttachmentListPanel";

export interface VaultAttachmentsAdminSurfaceProps {
  readonly vaultId: number;
  /** Optional cap forwarded to the list panel (router enforces 1..500). */
  readonly listLimit?: number;
}

export function VaultAttachmentsAdminSurface({
  vaultId,
  listLimit,
}: VaultAttachmentsAdminSurfaceProps) {
  return (
    <div
      className="space-y-4"
      data-testid="vault-attachments-admin-surface"
      data-vault-id={vaultId}
    >
      <AttachmentQuotaPanel vaultId={vaultId} />
      <AttachmentListPanel vaultId={vaultId} limit={listLimit} />
    </div>
  );
}
