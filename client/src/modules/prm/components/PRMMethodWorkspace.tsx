/**
 * PRM Method Workspace — Renders method-specific UI based on method_type
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, Save, CheckCircle2 } from "lucide-react";

interface MethodWorkspaceProps {
  runId: number;
  methodType: string;
  initialData: Record<string, any> | null;
  status: string;
  caseId: number;
}

export function PRMMethodWorkspace({ runId, methodType, initialData, status, caseId }: MethodWorkspaceProps) {
  const [data, setData] = useState<Record<string, any>>(initialData || {});
  const utils = trpc.useUtils();

  const saveMutation = trpc.prm.methods.updateRun.useMutation({
    onSuccess: () => utils.prm.methods.listRuns.invalidate({ caseId }),
  });

  const completeMutation = trpc.prm.methods.completeRun.useMutation({
    onSuccess: () => utils.prm.methods.listRuns.invalidate({ caseId }),
  });

  const isCompleted = status === "completed";

  const handleSave = () => {
    saveMutation.mutate({ id: runId, workspaceData: data });
  };

  const handleComplete = () => {
    completeMutation.mutate({ id: runId });
  };

  const renderFiveWhys = () => {
    const whys = data.whys || Array.from({ length: 5 }, (_, i) => ({ level: i + 1, question: "", answer: "" }));
    return (
      <div className="space-y-3">
        {whys.map((w: any, i: number) => (
          <div key={i} className="border rounded-lg p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Why #{w.level}</p>
            <textarea
              className="w-full text-sm bg-transparent border rounded p-2 min-h-[60px] resize-y"
              placeholder={`Why did this happen? (Level ${w.level})`}
              value={w.answer || ""}
              disabled={isCompleted}
              onChange={(e) => {
                const updated = [...whys];
                updated[i] = { ...w, answer: e.target.value };
                setData({ ...data, whys: updated });
              }}
            />
          </div>
        ))}
        <div className="border rounded-lg p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Root Cause</p>
          <textarea
            className="w-full text-sm bg-transparent border rounded p-2 min-h-[60px] resize-y"
            placeholder="What is the root cause?"
            value={data.rootCause || ""}
            disabled={isCompleted}
            onChange={(e) => setData({ ...data, rootCause: e.target.value })}
          />
        </div>
      </div>
    );
  };

  const renderFishbone = () => {
    const categories = data.categories || {
      people: [], process: [], equipment: [], materials: [], environment: [], management: [],
    };
    return (
      <div className="space-y-3">
        <div className="border rounded-lg p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Problem Statement</p>
          <textarea
            className="w-full text-sm bg-transparent border rounded p-2 min-h-[40px] resize-y"
            placeholder="Describe the problem"
            value={data.problem || ""}
            disabled={isCompleted}
            onChange={(e) => setData({ ...data, problem: e.target.value })}
          />
        </div>
        {Object.entries(categories).map(([cat, causes]: [string, any]) => (
          <div key={cat} className="border rounded-lg p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1 capitalize">{cat}</p>
            <textarea
              className="w-full text-sm bg-transparent border rounded p-2 min-h-[40px] resize-y"
              placeholder={`Causes related to ${cat} (one per line)`}
              value={Array.isArray(causes) ? causes.join("\n") : ""}
              disabled={isCompleted}
              onChange={(e) => {
                const updated = { ...categories, [cat]: e.target.value.split("\n").filter(Boolean) };
                setData({ ...data, categories: updated });
              }}
            />
          </div>
        ))}
      </div>
    );
  };

  const renderGeneric = () => (
    <div className="border rounded-lg p-3">
      <p className="text-xs font-medium text-muted-foreground mb-1">Workspace Data</p>
      <textarea
        className="w-full text-sm bg-transparent border rounded p-2 min-h-[200px] resize-y font-mono"
        placeholder="Enter investigation notes..."
        value={typeof data === "object" ? JSON.stringify(data, null, 2) : String(data)}
        disabled={isCompleted}
        onChange={(e) => {
          try { setData(JSON.parse(e.target.value)); } catch { /* keep raw */ }
        }}
      />
    </div>
  );

  let content: React.ReactNode;
  switch (methodType) {
    case "five_whys":
      content = renderFiveWhys();
      break;
    case "fishbone":
      content = renderFishbone();
      break;
    default:
      content = renderGeneric();
  }

  return (
    <div className="space-y-3">
      {content}
      {!isCompleted && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Save
          </Button>
          <Button
            size="sm"
            onClick={handleComplete}
            disabled={completeMutation.isPending}
          >
            {completeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
            Complete
          </Button>
        </div>
      )}
    </div>
  );
}
