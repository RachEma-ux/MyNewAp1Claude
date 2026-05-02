/**
 * PS Ideation — Header
 *
 * Shows: Back + Title + Source badge + Lifecycle badge + Save state + Step progress
 * Actions: Wizard handoff, Overflow (duplicate / defer / reject / delete)
 * Action hierarchy: identity → source → lifecycle → save → progress → wizard → duplicate → destructive (overflow)
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Wand2,
  Loader2,
  Save,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  Trash2,
  PauseCircle,
  XCircle,
  Copy,
} from "lucide-react";
import { Link } from "wouter";
import type { IdeationLifecycleStatus } from "@shared/ps-ideation-constants";
import type { SaveStatus } from "./PSIdeationMobileBar";
import { IDEATION_SOURCE_CONFIGS } from "@/config/psNavConfig";

interface Props {
  title: string;
  sourceType?: string;
  lifecycleStatus: IdeationLifecycleStatus;
  isConverted: boolean;
  readiness?: { ready: boolean; blockers: string[]; warnings: string[] } | null;
  saveStatus: SaveStatus;
  stepIndex: number;
  stepCount: number;
  stepLabel: string;
  completedCount: number;
  onConvert?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onDefer?: () => void;
  onReject?: () => void;
  deleting?: boolean;
  duplicating?: boolean;
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

function SaveIndicator({ status }: { status: SaveStatus }) {
  switch (status) {
    case "saving":
      return <span className="flex items-center gap-1 text-xs text-blue-500"><Loader2 className="w-3 h-3 animate-spin" />Saving…</span>;
    case "saved":
      return <span className="flex items-center gap-1 text-xs text-green-500"><CheckCircle2 className="w-3 h-3" />Saved</span>;
    case "unsaved":
      return <span className="flex items-center gap-1 text-xs text-amber-500"><Save className="w-3 h-3" />Unsaved</span>;
    case "error":
      return <span className="flex items-center gap-1 text-xs text-red-500"><AlertCircle className="w-3 h-3" />Save failed</span>;
    default:
      return null;
  }
}

export function PSIdeationHeader({
  title, sourceType, lifecycleStatus, isConverted, readiness, saveStatus,
  stepIndex, stepCount, stepLabel, completedCount,
  onConvert, onDuplicate, onDelete, onDefer, onReject, deleting, duplicating,
}: Props) {
  const progressPct = stepCount > 0 ? Math.round((completedCount / stepCount) * 100) : 0;

  return (
    <div className="border-b border-border">
      {/* Main row */}
      <div className="flex items-center justify-between px-3 py-1.5 gap-2">
        {/* Left: Back + Title + Badges */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link href="/ps/ideation">
            <Button variant="ghost" size="sm" className="shrink-0 h-7 w-7 p-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-sm font-semibold truncate">{title}</h1>
          <Badge variant="outline" className={`shrink-0 text-[10px] ${STATUS_COLORS[lifecycleStatus] || ""}`}>
            {STATUS_LABELS[lifecycleStatus] || lifecycleStatus}
          </Badge>
          {/* Source badge — hidden on mobile for space */}
          {sourceType && IDEATION_SOURCE_CONFIGS[sourceType] && (
            <Badge variant="outline" className={`shrink-0 text-[10px] hidden sm:inline-flex ${IDEATION_SOURCE_CONFIGS[sourceType].badgeClass}`}>
              {IDEATION_SOURCE_CONFIGS[sourceType].label}
            </Badge>
          )}
          {/* Save indicator — hidden on mobile (shown in bottom bar instead) */}
          <div className="hidden sm:block shrink-0">
            <SaveIndicator status={saveStatus} />
          </div>
        </div>

        {/* Right: Wizard + Overflow */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Wizard handoff — primary action when ready */}
          {readiness?.ready && !isConverted && onConvert && (
            <Button onClick={onConvert} size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 hidden sm:flex">
              <Wand2 className="w-3.5 h-3.5 mr-1" />
              Open in Wizard
            </Button>
          )}

          {/* Overflow menu — destructive and secondary actions */}
          {!isConverted && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {readiness?.ready && onConvert && (
                  <DropdownMenuItem onClick={onConvert} className="sm:hidden">
                    <Wand2 className="w-3.5 h-3.5 mr-2" />
                    Open in Wizard
                  </DropdownMenuItem>
                )}
                {onDuplicate && (
                  <DropdownMenuItem onClick={onDuplicate} disabled={duplicating}>
                    {duplicating ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Copy className="w-3.5 h-3.5 mr-2" />}
                    Duplicate
                  </DropdownMenuItem>
                )}
                {onDuplicate && (onDefer || onReject || onDelete) && <DropdownMenuSeparator />}
                {onDefer && (
                  <DropdownMenuItem onClick={onDefer}>
                    <PauseCircle className="w-3.5 h-3.5 mr-2" />
                    Defer
                  </DropdownMenuItem>
                )}
                {onReject && (
                  <DropdownMenuItem onClick={onReject}>
                    <XCircle className="w-3.5 h-3.5 mr-2" />
                    Reject
                  </DropdownMenuItem>
                )}
                {(onDefer || onReject) && onDelete && <DropdownMenuSeparator />}
                {onDelete && (
                  <DropdownMenuItem onClick={onDelete} disabled={deleting} className="text-red-500 focus:text-red-500">
                    {deleting ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-2" />}
                    Delete Draft
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Progress row — step indicator + bar */}
      <div className="flex items-center gap-2 px-3 pb-1.5">
        <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
          Step {stepIndex + 1} of {stepCount}
        </span>
        <Progress value={progressPct} className="h-1.5 flex-1" />
        <span className="text-[10px] text-muted-foreground shrink-0 truncate max-w-[140px] hidden sm:inline">
          {stepLabel}
        </span>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {completedCount}/{stepCount} done
        </span>
      </div>
    </div>
  );
}
