import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PanelRightClose,
  ShieldCheck,
  Eye,
  Route,
  FileSearch,
  Clock,
  AlertTriangle,
  BarChart3,
} from "lucide-react";

interface OversightSection {
  label: string;
  icon: React.ElementType;
  content: React.ReactNode;
}

interface KGIAOversightDrawerProps {
  open: boolean;
  onClose: () => void;
  envelope?: {
    selectedMode?: string;
    confidence?: { overall: number };
    observedFacts?: string[];
    inferredClaims?: string[];
    provenanceRefs?: Array<{ sourceType: string; sourceRef: string }>;
    temporalValidity?: { asOf?: string; temporalWarning?: string };
    missingKnowledge?: string[];
    governanceVerdict?: { safe: boolean; violations: string[] };
  } | null;
  queryPlan?: { queryLanguage?: string; queryText?: string; intent?: string } | null;
}

export default function KGIAOversightDrawer({
  open,
  onClose,
  envelope,
  queryPlan,
}: KGIAOversightDrawerProps) {
  if (!open) return null;

  const sections: OversightSection[] = [];

  // Mode
  if (envelope?.selectedMode) {
    sections.push({
      label: "Mode",
      icon: Route,
      content: (
        <Badge variant="outline" className="text-xs">
          {envelope.selectedMode.replace(/_/g, " ")}
        </Badge>
      ),
    });
  }

  // Confidence
  if (envelope?.confidence) {
    const pct = (envelope.confidence.overall * 100).toFixed(0);
    sections.push({
      label: "Confidence",
      icon: BarChart3,
      content: (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-mono">{pct}%</span>
        </div>
      ),
    });
  }

  // Query plan
  if (queryPlan?.queryText) {
    sections.push({
      label: "Query Plan",
      icon: FileSearch,
      content: (
        <div className="space-y-1">
          {queryPlan.intent && (
            <div className="text-xs text-muted-foreground">Intent: {queryPlan.intent}</div>
          )}
          <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
            {queryPlan.queryText}
          </pre>
        </div>
      ),
    });
  }

  // Evidence summary
  if (envelope?.observedFacts && envelope.observedFacts.length > 0) {
    sections.push({
      label: "Observed Facts",
      icon: Eye,
      content: (
        <ul className="space-y-0.5 text-xs">
          {envelope.observedFacts.slice(0, 10).map((f, i) => (
            <li key={i} className="text-muted-foreground">
              {typeof f === "string" ? f : JSON.stringify(f)}
            </li>
          ))}
        </ul>
      ),
    });
  }

  // Provenance
  if (envelope?.provenanceRefs && envelope.provenanceRefs.length > 0) {
    sections.push({
      label: "Provenance",
      icon: FileSearch,
      content: (
        <ul className="space-y-0.5 text-xs">
          {envelope.provenanceRefs.slice(0, 5).map((p, i) => (
            <li key={i} className="text-muted-foreground">
              [{p.sourceType}] {p.sourceRef}
            </li>
          ))}
        </ul>
      ),
    });
  }

  // Temporal validity
  if (envelope?.temporalValidity?.temporalWarning) {
    sections.push({
      label: "Time Validity",
      icon: Clock,
      content: (
        <div className="text-xs text-yellow-500">{envelope.temporalValidity.temporalWarning}</div>
      ),
    });
  }

  // Missing knowledge
  if (envelope?.missingKnowledge && envelope.missingKnowledge.length > 0) {
    sections.push({
      label: "Missing Knowledge",
      icon: AlertTriangle,
      content: (
        <ul className="space-y-0.5 text-xs">
          {envelope.missingKnowledge.map((g, i) => (
            <li key={i} className="text-yellow-500">
              {typeof g === "string" ? g : JSON.stringify(g)}
            </li>
          ))}
        </ul>
      ),
    });
  }

  // Governance verdict
  if (envelope?.governanceVerdict) {
    sections.push({
      label: "Governance",
      icon: ShieldCheck,
      content: (
        <div className="space-y-1">
          <Badge
            variant={envelope.governanceVerdict.safe ? "default" : "destructive"}
            className="text-xs"
          >
            {envelope.governanceVerdict.safe ? "Allow" : "Deny"}
          </Badge>
          {envelope.governanceVerdict.violations?.length > 0 && (
            <ul className="text-xs text-red-400 space-y-0.5">
              {envelope.governanceVerdict.violations.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          )}
        </div>
      ),
    });
  }

  return (
    <div className="w-72 border-l border-border bg-card flex flex-col shrink-0">
      <div className="flex items-center justify-between px-3 h-12 border-b border-border shrink-0">
        <span className="text-sm font-semibold">Oversight</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <PanelRightClose className="w-3.5 h-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {sections.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-8">
              Run a query to see oversight details
            </div>
          )}
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Icon className="w-3 h-3" />
                  {s.label}
                </div>
                <div className="pl-4">{s.content}</div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
