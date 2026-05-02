/**
 * AI Agent Studio — Behavior Page
 *
 * Mission, role, scope, allowed/blocked tasks, success criteria, escalation
 * rules, autonomy level, intervention triggers. Generates a behavior contract
 * preview.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Brain } from "lucide-react";
import { PageHeader, LoadingState } from "../components/ui";

export default function AgentBehaviorPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const query = trpc.agentStudio.behavior.get.useQuery({ agentId });
  const updateMut = trpc.agentStudio.behavior.update.useMutation({
    onSuccess: () => {
      toast.success("Behavior saved");
      utils.agentStudio.behavior.get.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [mission, setMission] = useState("");
  const [role, setRole] = useState("");
  const [scope, setScope] = useState("");
  const [allowedTasks, setAllowedTasks] = useState("");
  const [blockedTasks, setBlockedTasks] = useState("");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [escalationRules, setEscalationRules] = useState("");
  const [autonomyLevel, setAutonomyLevel] = useState("supervised");
  const [interventionTriggers, setInterventionTriggers] = useState("");

  useEffect(() => {
    if (query.data) {
      const d = query.data as any;
      setMission(d.mission ?? "");
      setRole(d.role ?? "");
      setScope(d.scope ?? "");
      setAllowedTasks((d.allowedTasks ?? []).join("\n"));
      setBlockedTasks((d.blockedTasks ?? []).join("\n"));
      setSuccessCriteria(d.successCriteria ?? "");
      setEscalationRules(d.escalationRules ?? "");
      setAutonomyLevel(d.autonomyLevel ?? "supervised");
      setInterventionTriggers((d.interventionTriggers ?? []).join("\n"));
    }
  }, [query.data]);

  if (query.isLoading) return <LoadingState label="Loading behavior…" />;

  const handleSave = () => {
    updateMut.mutate({
      agentId,
      mission,
      role,
      scope,
      allowedTasks: allowedTasks.split("\n").filter(Boolean),
      blockedTasks: blockedTasks.split("\n").filter(Boolean),
      successCriteria,
      escalationRules,
      autonomyLevel: autonomyLevel as any,
      interventionTriggers: interventionTriggers.split("\n").filter(Boolean),
    });
  };

  const contractPreview = `BEHAVIOR CONTRACT
─────────────────
Mission:    ${mission || "(undefined)"}
Role:       ${role || "(undefined)"}
Scope:      ${scope || "(undefined)"}
Autonomy:   ${autonomyLevel}

Allowed:
${allowedTasks
  .split("\n")
  .filter(Boolean)
  .map((t) => `  ✓ ${t}`)
  .join("\n") || "  (none)"}

Blocked:
${blockedTasks
  .split("\n")
  .filter(Boolean)
  .map((t) => `  ✗ ${t}`)
  .join("\n") || "  (none)"}

Success:    ${successCriteria || "(undefined)"}
Escalation: ${escalationRules || "(undefined)"}`;

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Behavior"
        subtitle="Mission, scope, allowed/blocked tasks, and autonomy level"
        icon={<Brain className="h-4 w-4" />}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card className="lg:col-span-1">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Behavior Configuration</h3>

          <Field label="Mission">
            <Textarea value={mission} onChange={(e) => setMission(e.target.value)} className="text-xs min-h-[60px]" />
          </Field>
          <Field label="Role">
            <Input value={role} onChange={(e) => setRole(e.target.value)} className="h-8 text-xs" />
          </Field>
          <Field label="Scope">
            <Textarea value={scope} onChange={(e) => setScope(e.target.value)} className="text-xs min-h-[50px]" />
          </Field>
          <Field label="Allowed Tasks (one per line)">
            <Textarea value={allowedTasks} onChange={(e) => setAllowedTasks(e.target.value)} className="text-xs min-h-[70px] font-mono" />
          </Field>
          <Field label="Blocked Tasks (one per line)">
            <Textarea value={blockedTasks} onChange={(e) => setBlockedTasks(e.target.value)} className="text-xs min-h-[70px] font-mono" />
          </Field>
          <Field label="Success Criteria">
            <Textarea value={successCriteria} onChange={(e) => setSuccessCriteria(e.target.value)} className="text-xs min-h-[50px]" />
          </Field>
          <Field label="Escalation Rules">
            <Textarea value={escalationRules} onChange={(e) => setEscalationRules(e.target.value)} className="text-xs min-h-[50px]" />
          </Field>
          <Field label="Autonomy Level">
            <select
              value={autonomyLevel}
              onChange={(e) => setAutonomyLevel(e.target.value)}
              className="h-8 px-2 rounded border bg-background text-xs w-full"
            >
              <option value="manual">Manual</option>
              <option value="supervised">Supervised</option>
              <option value="semi_autonomous">Semi-Autonomous</option>
              <option value="autonomous">Autonomous</option>
            </select>
          </Field>
          <Field label="Intervention Triggers (one per line)">
            <Textarea value={interventionTriggers} onChange={(e) => setInterventionTriggers(e.target.value)} className="text-xs min-h-[60px] font-mono" />
          </Field>

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
              {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Save Behavior
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Contract preview */}
      <Card className="lg:col-span-1">
        <CardContent className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">
            Behavior Contract Preview
          </div>
          <pre className="text-[10px] font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded">
            {contractPreview}
          </pre>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</Label>
      {children}
    </div>
  );
}
