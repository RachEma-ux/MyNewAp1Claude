/**
 * AI Agent Studio — Bottom Status Bar
 *
 * Persistent operational footer. Mirrors the IBM-style enterprise pattern:
 * compact, dense, scannable status segments separated by visual dividers.
 *
 * Segments (left to right):
 *   saved at · validation · simulation · version · environment · policy · unsaved
 */
import { cn } from "@/lib/utils";
import {
  Circle,
  Save,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertCircle,
} from "lucide-react";

interface Props {
  lastSaved?: Date | string | null;
  validationState: "ok" | "warning" | "error" | "unknown";
  simulationState: string;
  version: string;
  environment: string;
  policyState: "pass" | "warning" | "blocked";
  unsavedChanges: boolean;
}

/** Vertical divider segment used between status items */
function Divider() {
  return <span className="w-px h-3 bg-border/60" aria-hidden="true" />;
}

function StatusItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-1", className)}>{children}</span>
  );
}

export default function AgentStudioStatusBar({
  lastSaved,
  validationState,
  simulationState,
  version,
  environment,
  policyState,
  unsavedChanges,
}: Props) {
  const policyIcon =
    policyState === "pass" ? (
      <ShieldCheck className="h-2.5 w-2.5 text-emerald-500" />
    ) : policyState === "warning" ? (
      <ShieldAlert className="h-2.5 w-2.5 text-yellow-500" />
    ) : (
      <ShieldX className="h-2.5 w-2.5 text-red-500" />
    );

  return (
    <div className="border-t bg-background/80 backdrop-blur-sm shrink-0 px-3 py-1 flex items-center gap-2 text-[10px] text-muted-foreground">
      <StatusItem>
        <Save className="h-2.5 w-2.5" />
        <span>{lastSaved ? `Saved ${formatTime(lastSaved)}` : "Never saved"}</span>
      </StatusItem>

      <Divider />

      <StatusItem>
        <Circle
          className={cn(
            "h-2 w-2 fill-current",
            validationState === "ok" && "text-emerald-500",
            validationState === "warning" && "text-yellow-500",
            validationState === "error" && "text-red-500",
            validationState === "unknown" && "text-muted-foreground/40"
          )}
        />
        <span className="capitalize">Validation {validationState}</span>
      </StatusItem>

      <Divider />

      <StatusItem>
        <span className="text-muted-foreground/60">Sim:</span>
        <span className="text-foreground/80">{simulationState}</span>
      </StatusItem>

      <Divider />

      <StatusItem>
        <span className="text-muted-foreground/60">Version:</span>
        <span className="text-foreground/80 font-mono">{version}</span>
      </StatusItem>

      <Divider />

      <StatusItem>
        <span className="text-muted-foreground/60">Env:</span>
        <span className="uppercase text-foreground/80 font-mono">{environment}</span>
      </StatusItem>

      <Divider />

      <StatusItem>
        {policyIcon}
        <span className="capitalize">Policy {policyState}</span>
      </StatusItem>

      {unsavedChanges && (
        <>
          <Divider />
          <StatusItem className="text-yellow-400">
            <AlertCircle className="h-2.5 w-2.5" />
            <span>Unsaved changes</span>
          </StatusItem>
        </>
      )}
    </div>
  );
}

function formatTime(t: Date | string): string {
  const d = typeof t === "string" ? new Date(t) : t;
  return d.toLocaleTimeString();
}
