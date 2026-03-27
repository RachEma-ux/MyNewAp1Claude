/**
 * PS Ideation — Detail Page
 *
 * Wraps the PSIdeationShell with route parameter extraction.
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
    <div className="h-[calc(100vh-64px)]">
      <PSIdeationShell ideationId={ideationId} />
    </div>
  );
}

export default PSIdeationDetailPage;
