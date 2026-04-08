/**
 * AI Agent Studio — Top Action Bar
 *
 * Always visible on agent detail pages. Shows agent name, class/state/env
 * badges, and grouped operational actions:
 *
 *   [name] [class] [state] [env] | [save] | [simulate] [test] | [compare] [version] | [publish] [more]
 *
 * Action grouping makes the operational hierarchy clear:
 *   Save              → persistence
 *   Simulate / Test   → evaluation
 *   Compare / Version → versioning
 *   Publish           → release (primary)
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  PlayCircle,
  FlaskConical,
  GitCompare,
  GitBranch,
  Rocket,
  MoreHorizontal,
  Loader2,
} from "lucide-react";
import LifecycleBadge from "./ui/LifecycleBadge";

export interface AgentStudioTopBarProps {
  agentName: string;
  agentClass: string;
  lifecycleState: string;
  environment: string;
  saving?: boolean;
  onSaveDraft?: () => void;
  onRunSimulation?: () => void;
  onRunTest?: () => void;
  onCompareVersion?: () => void;
  onCreateVersion?: () => void;
  onPublish?: () => void;
}

/** Vertical separator between action groups in the top bar */
function ActionDivider() {
  return <span className="w-px h-5 bg-border/70 mx-0.5" aria-hidden="true" />;
}

export default function AgentStudioTopBar({
  agentName,
  agentClass,
  lifecycleState,
  environment,
  saving,
  onSaveDraft,
  onRunSimulation,
  onRunTest,
  onCompareVersion,
  onCreateVersion,
  onPublish,
}: AgentStudioTopBarProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b bg-background/80 backdrop-blur-sm shrink-0">
      {/* Identity cluster */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className="text-sm font-semibold tracking-tight truncate"
          title={agentName}
        >
          {agentName}
        </span>
        <Badge
          variant="outline"
          className="text-[9px] uppercase tracking-wider font-medium"
        >
          {agentClass}
        </Badge>
        <LifecycleBadge state={lifecycleState} />
        <Badge
          variant="outline"
          className="text-[9px] uppercase tracking-wider font-medium text-muted-foreground"
        >
          env · {environment}
        </Badge>
      </div>

      {/* Action clusters with visual grouping */}
      <div className="flex items-center gap-0.5">
        {/* Persistence */}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onSaveDraft}
          disabled={saving}
          title="Refresh shell summary (drafts auto-save on each section save)"
        >
          {saving ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Save className="h-3 w-3 mr-1" />
          )}
          {saving ? "Working…" : "Refresh"}
        </Button>

        <ActionDivider />

        {/* Evaluation */}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onRunSimulation}
          title="Run a dry-run simulation against the current draft"
        >
          <PlayCircle className="h-3 w-3 mr-1" /> Simulate
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onRunTest}
          title="Open the test suites page"
        >
          <FlaskConical className="h-3 w-3 mr-1" /> Test
        </Button>

        <ActionDivider />

        {/* Versioning */}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onCompareVersion}
          title="Compare two versions"
        >
          <GitCompare className="h-3 w-3 mr-1" /> Compare
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onCreateVersion}
          title="Snapshot the current draft as a new version"
        >
          <GitBranch className="h-3 w-3 mr-1" /> Version
        </Button>

        <ActionDivider />

        {/* Release (primary) */}
        <Button
          size="sm"
          variant="default"
          className="h-7 px-3 text-xs font-semibold"
          onClick={onPublish}
          title="Open the publish page"
        >
          <Rocket className="h-3 w-3 mr-1" /> Publish
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          title="More actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
