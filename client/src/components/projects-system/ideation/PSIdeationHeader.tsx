/**
 * PS Ideation — Header
 *
 * Shows ideation title, lifecycle badge, and action buttons.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wand2, Trash2, Loader2 } from "lucide-react";
import { Link } from "wouter";
import type { IdeationLifecycleStatus } from "../../../../../server/ps/ps.ideation-types";

interface Props {
  title: string;
  lifecycleStatus: IdeationLifecycleStatus;
  isConverted: boolean;
  readiness?: { ready: boolean; blockers: string[]; warnings: string[] } | null;
  onConvert?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 border-gray-500/30",
  in_exploration: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  screening: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  concept_selected: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  ready_for_wizard: "bg-green-500/10 text-green-600 border-green-500/30",
  deferred: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  rejected: "bg-red-500/10 text-red-600 border-red-500/30",
  converted: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_exploration: "In Exploration",
  screening: "Screening",
  concept_selected: "Concept Selected",
  ready_for_wizard: "Ready for Wizard",
  deferred: "Deferred",
  rejected: "Rejected",
  converted: "Converted",
};

export function PSIdeationHeader({
  title, lifecycleStatus, isConverted, readiness, onConvert, onDelete, deleting,
}: Props) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/ps/ideation">
          <Button variant="ghost" size="sm" className="shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold truncate">{title}</h1>
        <Badge variant="outline" className={STATUS_COLORS[lifecycleStatus] || ""}>
          {STATUS_LABELS[lifecycleStatus] || lifecycleStatus}
        </Badge>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {readiness?.ready && !isConverted && onConvert && (
          <Button onClick={onConvert} size="sm" className="bg-green-600 hover:bg-green-700">
            <Wand2 className="w-4 h-4 mr-1" />
            Convert to Wizard
          </Button>
        )}
        {!isConverted && onDelete && (
          <Button onClick={onDelete} variant="ghost" size="sm" className="text-red-500" disabled={deleting}>
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
