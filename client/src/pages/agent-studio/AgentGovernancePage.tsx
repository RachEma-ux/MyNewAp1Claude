/**
 * AI Agent Studio — Governance Page
 *
 * Blocked actions, sensitive data, approvals, confidence thresholds,
 * budget ceilings, audit, freeze rules, kill switch. Live verdict.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PageHeader,
  LoadingState,
  VerdictBadge,
} from "@/components/agent-studio/ui";

export default function AgentGovernancePage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const policyQuery = trpc.agentStudio.governance.get.useQuery({ agentId });
  const verdictQuery = trpc.agentStudio.governance.evaluate.useQuery({ agentId });
  const updateMut = trpc.agentStudio.governance.update.useMutation({
    onSuccess: () => {
      toast.success("Policy saved");
      utils.agentStudio.governance.get.invalidate({ agentId });
      utils.agentStudio.governance.evaluate.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [blockedActionsText, setBlockedText] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [budgetCeiling, setBudgetCeiling] = useState<number | "">("");
  const [auditRequired, setAuditRequired] = useState(true);
  const [killSwitchEnabled, setKillSwitch] = useState(true);
  const [confidenceThreshold, setConfidence] = useState<number | "">("");
  const [freezeRulesText, setFreezeRules] = useState("");

  useEffect(() => {
    if (policyQuery.data?.policy) {
      const p = policyQuery.data.policy as any;
      setBlockedText((p.blockedActions ?? []).join("\n"));
      setApprovalRequired(!!p.approvalRequired);
      setBudgetCeiling(typeof p.budgetCeiling === "number" ? p.budgetCeiling : "");
      setAuditRequired(p.auditRequired !== false);
      setKillSwitch(p.killSwitchEnabled !== false);
      setConfidence(typeof p.confidenceThreshold === "number" ? p.confidenceThreshold : "");
      setFreezeRules((p.freezeRules ?? []).join("\n"));
    }
  }, [policyQuery.data]);

  if (policyQuery.isLoading || verdictQuery.isLoading)
    return <LoadingState label="Loading governance…" />;

  const verdict = verdictQuery.data?.verdict ?? "pass";
  const reasons = verdictQuery.data?.reasons ?? [];

  const handleSave = () => {
    updateMut.mutate({
      agentId,
      policy: {
        blockedActions: blockedActionsText.split("\n").filter(Boolean),
        approvalRequired,
        budgetCeiling: budgetCeiling === "" ? null : Number(budgetCeiling),
        auditRequired,
        killSwitchEnabled,
        confidenceThreshold: confidenceThreshold === "" ? null : Number(confidenceThreshold),
        freezeRules: freezeRulesText.split("\n").filter(Boolean),
      },
    });
  };

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Governance"
        subtitle="Policy matrix, blocked actions, approvals, audit, and live verdict"
        icon={<ShieldCheck className="h-4 w-4" />}
        badges={
          <span className="ml-2">
            <VerdictBadge verdict={verdict} showIcon />
          </span>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Verdict panel */}
      <Card className="lg:col-span-1">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Live Verdict</h3>
          <div className="flex items-center gap-2">
            {verdict === "pass" ? (
              <ShieldCheck className="h-8 w-8 text-emerald-500" />
            ) : verdict === "warning" ? (
              <ShieldAlert className="h-8 w-8 text-yellow-500" />
            ) : (
              <ShieldX className="h-8 w-8 text-red-500" />
            )}
            <Badge
              className={cn(
                "text-xs uppercase border",
                verdict === "pass" && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                verdict === "warning" && "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
                verdict === "blocked" && "bg-red-500/15 text-red-400 border-red-500/30"
              )}
            >
              {verdict}
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">Risk score: {verdictQuery.data?.riskScore ?? 0}/100</p>

          {reasons.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase text-muted-foreground/70 font-semibold">
                Policy Explanation Log
              </div>
              <ul className="space-y-1">
                {reasons.map((r: any, i: number) => (
                  <li key={i} className="text-[10px] border rounded p-1.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] mr-1",
                        r.severity === "blocker" && "border-red-500/40 text-red-400",
                        r.severity === "warning" && "border-yellow-500/40 text-yellow-400"
                      )}
                    >
                      {r.severity}
                    </Badge>
                    <span className="font-mono">{r.rule}</span>
                    <p className="opacity-80 mt-0.5">{r.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Policy matrix */}
      <Card className="lg:col-span-2">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-base font-semibold">Policy Matrix</h3>
          <Field label="Blocked Actions (one per line)">
            <Textarea
              value={blockedActionsText}
              onChange={(e) => setBlockedText(e.target.value)}
              className="text-xs min-h-[60px] font-mono"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget Ceiling (cost units)">
              <Input
                type="number"
                value={budgetCeiling}
                onChange={(e) => setBudgetCeiling(e.target.value ? parseInt(e.target.value, 10) : "")}
                className="h-8 text-xs"
              />
            </Field>
            <Field label="Confidence Threshold (0-100)">
              <Input
                type="number"
                value={confidenceThreshold}
                onChange={(e) => setConfidence(e.target.value ? parseInt(e.target.value, 10) : "")}
                className="h-8 text-xs"
              />
            </Field>
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={approvalRequired}
                onChange={(e) => setApprovalRequired(e.target.checked)}
              />
              Require approval for sensitive actions
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={auditRequired}
                onChange={(e) => setAuditRequired(e.target.checked)}
              />
              Audit logging required
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={killSwitchEnabled}
                onChange={(e) => setKillSwitch(e.target.checked)}
              />
              Kill switch enabled
            </label>
          </div>
          <Field label="Freeze Rules (one per line)">
            <Textarea
              value={freezeRulesText}
              onChange={(e) => setFreezeRules(e.target.value)}
              className="text-xs min-h-[60px] font-mono"
            />
          </Field>
          <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
            {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Save Governance Policy
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase text-muted-foreground/70">{label}</Label>
      {children}
    </div>
  );
}
