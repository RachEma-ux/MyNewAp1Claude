/**
 * PS Ideation — Detail Page
 *
 * Layout cloned from PmCentralSidebarLayout (no cross-module import).
 * Pattern: "flex -mx-6 -mt-6 overflow-hidden" with calc(100vh - 4rem).
 */
import { useParams } from "wouter";
import { PSIdeationShell } from "@/components/projects-system/ideation/PSIdeationShell";

export function PSIdeationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const ideationId = parseInt(id || "0", 10);

  if (!ideationId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Invalid ideation ID.
      </div>
    );
  }

  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <PSIdeationShell ideationId={ideationId} />
    </div>
  );
}

export default PSIdeationDetailPage;
