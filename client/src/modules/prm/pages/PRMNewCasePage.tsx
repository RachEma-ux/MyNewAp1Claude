/**
 * PRM New Case Page — Intake form
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const SEVERITIES = ["critical", "high", "medium", "low"];
const PRIORITIES = ["p1", "p2", "p3", "p4"];
const SOURCE_TYPES = ["incident", "defect", "complaint", "process", "operational", "other"];

export default function PRMNewCasePage() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "",
    priority: "",
    sourceType: "",
    impactStatement: "",
    scope: "",
  });

  const createMutation = trpc.prm.cases.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Case #${data.id} created`);
      navigate(`/prm/cases/${data.id}`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    createMutation.mutate({
      title: form.title,
      description: form.description || undefined,
      severity: (form.severity || undefined) as any,
      priority: (form.priority || undefined) as any,
      sourceType: (form.sourceType || undefined) as any,
      impactStatement: form.impactStatement || undefined,
      scope: form.scope || undefined,
    });
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold mb-6">New PRM Case</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Brief description of the problem"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
          <textarea
            className="w-full text-sm bg-transparent border rounded-md p-2 min-h-[100px] resize-y"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Detailed description of the problem..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Severity</label>
            <select
              className="w-full text-sm bg-transparent border rounded-md p-2"
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
            >
              <option value="">Select...</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
            <select
              className="w-full text-sm bg-transparent border rounded-md p-2"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="">Select...</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Source Type</label>
          <select
            className="w-full text-sm bg-transparent border rounded-md p-2"
            value={form.sourceType}
            onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
          >
            <option value="">Select...</option>
            {SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Impact Statement</label>
          <textarea
            className="w-full text-sm bg-transparent border rounded-md p-2 min-h-[60px] resize-y"
            value={form.impactStatement}
            onChange={(e) => setForm({ ...form, impactStatement: e.target.value })}
            placeholder="What is the business impact?"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Scope</label>
          <textarea
            className="w-full text-sm bg-transparent border rounded-md p-2 min-h-[60px] resize-y"
            value={form.scope}
            onChange={(e) => setForm({ ...form, scope: e.target.value })}
            placeholder="What systems/processes are affected?"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Create Case
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/prm/cases")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
