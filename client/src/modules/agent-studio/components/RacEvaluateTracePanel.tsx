// RacEvaluateTracePanel — no-deferral continuation-36 slice 141.
//
// Closes the UI-consumer gap for racEvaluation.evaluate — the only
// unconsumed endpoint on the racEvaluation router. Renders alongside
// RacEvaluationPanel inside the RacPage "evaluation" tab.

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface Props {
  workspaceId: number;
}

export function RacEvaluateTracePanel({ workspaceId }: Props) {
  const [traceIdRaw, setTraceIdRaw] = useState("");
  const [modelOutput, setModelOutput] = useState("");

  const traceId = parsePositiveInt(traceIdRaw);
  const formValid = traceId !== null && modelOutput.trim().length > 0;

  const mut = trpc.agentStudio.racEvaluation.evaluate.useMutation({
    onSuccess: () => toast.success(`Trace ${traceId} evaluated`),
    onError: (err) =>
      toast.error(`Evaluate failed: ${err.message ?? "unknown"}`),
  });

  const result = mut.data as
    | {
        traceId: number;
        groundedness: { score: number; warnings?: string[] };
        relevance: { score: number; warnings?: string[] };
        citationCoverage: { coverage: number; warnings?: string[] };
      }
    | undefined;

  return (
    <Card>
      <CardContent className="space-y-3 p-4" data-testid="rae-panel">
        <SectionLabel>Evaluate a trace</SectionLabel>
        <p className="text-xs text-muted-foreground">
          Scores a saved RAC trace against an operator-supplied model
          output. Persists groundedness + citation coverage back into
          the trace row.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="rae-trace-id">Trace id</Label>
            <Input
              id="rae-trace-id"
              data-testid="rae-trace-id"
              type="number"
              min={1}
              value={traceIdRaw}
              onChange={(e) => setTraceIdRaw(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="rae-output">Model output</Label>
          <textarea
            id="rae-output"
            data-testid="rae-model-output"
            className="w-full rounded border bg-background p-2 font-mono text-xs"
            rows={4}
            value={modelOutput}
            onChange={(e) => setModelOutput(e.target.value)}
            placeholder="The assistant output the trace should be scored against."
          />
        </div>
        <Button
          type="button"
          disabled={!formValid || mut.isPending}
          onClick={() =>
            formValid &&
            mut.mutate({
              workspaceId,
              traceId,
              modelOutput: modelOutput.trim(),
            })
          }
          data-testid="rae-evaluate-button"
        >
          {mut.isPending ? "Evaluating…" : "Evaluate"}
        </Button>
        {result ? (
          <div
            className="space-y-2 rounded border bg-background p-3 font-mono text-xs"
            data-testid="rae-result"
          >
            <div>
              <span className="font-semibold">Groundedness:</span>{" "}
              {result.groundedness.score.toFixed(3)}
              {result.groundedness.warnings?.length ? (
                <ul className="ml-4 list-disc text-yellow-600">
                  {result.groundedness.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div>
              <span className="font-semibold">Relevance:</span>{" "}
              {result.relevance.score.toFixed(3)}
              {result.relevance.warnings?.length ? (
                <ul className="ml-4 list-disc text-yellow-600">
                  {result.relevance.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div>
              <span className="font-semibold">Citation coverage:</span>{" "}
              {result.citationCoverage.coverage.toFixed(3)}
              {result.citationCoverage.warnings?.length ? (
                <ul className="ml-4 list-disc text-yellow-600">
                  {result.citationCoverage.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
