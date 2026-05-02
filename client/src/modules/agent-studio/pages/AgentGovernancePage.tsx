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
import { Loader2, ShieldCheck, ShieldAlert, ShieldX, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PageHeader,
  LoadingState,
  VerdictBadge,
  EmptyState,
  SectionLabel,
} from "../components/ui";

const RULE_BEHAVIORS = ["allow", "deny", "ask"] as const;
const RULE_SOURCES = [
  "userSettings",
  "projectSettings",
  "localSettings",
  "cliArg",
  "session",
] as const;

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

      {/* Phase 0d: Permission Rules — rule-based access matrix per openllm-agent2 */}
      <Card className="lg:col-span-3">
        <CardContent className="p-4 space-y-3">
          <PermissionRulesSection agentId={agentId} />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

/** Phase 0d: rule-based permission matrix (openllm-agent2 native parity) */
function PermissionRulesSection({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const rulesQuery = trpc.agentStudio.permissionRules.list.useQuery({ agentId });
  const saveMut = trpc.agentStudio.permissionRules.save.useMutation({
    onSuccess: () => {
      toast.success("Rule saved");
      utils.agentStudio.permissionRules.list.invalidate({ agentId });
      setNewToolPattern("");
      setNewDescription("");
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMut = trpc.agentStudio.permissionRules.remove.useMutation({
    onSuccess: () => {
      toast.success("Rule removed");
      utils.agentStudio.permissionRules.list.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  // New-rule form
  const [newToolPattern, setNewToolPattern] = useState("");
  const [newBehavior, setNewBehavior] = useState<typeof RULE_BEHAVIORS[number]>("ask");
  const [newSource, setNewSource] = useState<typeof RULE_SOURCES[number]>("session");
  const [newDescription, setNewDescription] = useState("");

  const rules = rulesQuery.data ?? [];

  const handleAdd = () => {
    if (!newToolPattern) return;
    saveMut.mutate({
      agentId,
      ruleSource: newSource,
      ruleBehavior: newBehavior,
      toolPattern: newToolPattern,
      description: newDescription || undefined,
    });
  };

  return (
    <>
      <SectionLabel icon={<ShieldCheck className="h-3 w-3" />}>
        Permission Rules
      </SectionLabel>
      <p className="text-[10px] text-muted-foreground">
        Rule-based access matrix matching openllm-agent2's PermissionRule model.
        Rules are evaluated per tool invocation; first match wins.
      </p>

      {/* Add-rule form */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mt-2">
        <div className="md:col-span-2">
          <Input
            value={newToolPattern}
            onChange={(e) => setNewToolPattern(e.target.value)}
            placeholder="Tool pattern (e.g. Bash, Bash(*), Read)"
            className="h-7 text-xs font-mono"
          />
        </div>
        <select
          value={newBehavior}
          onChange={(e) =>
            setNewBehavior(e.target.value as typeof RULE_BEHAVIORS[number])
          }
          className="h-7 px-2 rounded border bg-background text-xs"
        >
          {RULE_BEHAVIORS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={newSource}
          onChange={(e) =>
            setNewSource(e.target.value as typeof RULE_SOURCES[number])
          }
          className="h-7 px-2 rounded border bg-background text-xs"
        >
          {RULE_SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          className="h-7"
          disabled={!newToolPattern || saveMut.isPending}
          onClick={handleAdd}
        >
          <Plus className="h-3 w-3 mr-1" /> Add Rule
        </Button>
      </div>
      <Input
        value={newDescription}
        onChange={(e) => setNewDescription(e.target.value)}
        placeholder="Optional description"
        className="h-7 text-xs"
      />

      {/* Rule list */}
      {rules.length === 0 ? (
        <EmptyState
          compact
          icon={<ShieldCheck className="h-6 w-6" />}
          title="No permission rules yet"
          description="Add a rule above to control which tools the agent can invoke."
        />
      ) : (
        <table className="w-full text-xs mt-2">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b">
            <tr>
              <th className="text-left py-1.5">Tool Pattern</th>
              <th className="text-left py-1.5">Behavior</th>
              <th className="text-left py-1.5">Source</th>
              <th className="text-left py-1.5">Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="py-1.5 font-mono text-[10px]">{r.toolPattern}</td>
                <td>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] uppercase",
                      r.ruleBehavior === "allow" &&
                        "border-emerald-500/40 text-emerald-400",
                      r.ruleBehavior === "deny" &&
                        "border-red-500/40 text-red-400",
                      r.ruleBehavior === "ask" &&
                        "border-yellow-500/40 text-yellow-400"
                    )}
                  >
                    {r.ruleBehavior}
                  </Badge>
                </td>
                <td className="text-[10px] text-muted-foreground">{r.ruleSource}</td>
                <td className="text-[10px] text-muted-foreground">
                  {r.description ?? "—"}
                </td>
                <td>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => removeMut.mutate({ ruleId: r.id })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
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
