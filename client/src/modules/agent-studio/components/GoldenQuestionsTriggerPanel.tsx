// GoldenQuestionsTriggerPanel — no-deferral continuation-12 slice 69.
//
// Closes the UI-consumer gap for slice 44's
// `goldenQuestions.triggerLiveEvaluation` (mutation shipped in
// continuation-4 but no UI caller until now).
//
// Pairs the mutation with `listSuites` so operators get a
// discoverable dropdown of seeded suite keys rather than having to
// memorize literals. The mutation returns the run id + per-suite
// outcomes — surfaced as a sonner toast (continuation-13 may add
// a recent-runs list / per-run drill-in).

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

// Min/max timeout bounds match the server-side Zod schema in
// `goldenQuestions.triggerLiveEvaluation` — keep in lockstep.
const TIMEOUT_MIN_MS = 1_000;
const TIMEOUT_MAX_MS = 600_000;
const TIMEOUT_DEFAULT_MS = 30_000;

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function GoldenQuestionsTriggerPanel() {
  const suitesQuery = trpc.agentStudio.goldenQuestions.listSuites.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const suites = suitesQuery.data?.suites ?? [];

  const [providerConnectionId, setProviderConnectionId] = useState("");
  const [modelRef, setModelRef] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [actorId, setActorId] = useState("");
  const [suiteKey, setSuiteKey] = useState<string>("");
  const [timeoutMs, setTimeoutMs] = useState<string>(
    String(TIMEOUT_DEFAULT_MS),
  );

  const triggerMut =
    trpc.agentStudio.goldenQuestions.triggerLiveEvaluation.useMutation({
      onSuccess: (data) => {
        const ranLabel =
          data.suitesRun.length === 1
            ? `1 suite (${data.suitesRun[0]})`
            : `${data.suitesRun.length} suites`;
        const persistedRunIds = data.persistence
          .filter((p) => p.status === "ok")
          .map((p) =>
            "ok" in p && p.ok === true && "runId" in p ? p.runId : null,
          )
          .filter((id): id is number => typeof id === "number");
        const runIdSuffix =
          persistedRunIds.length > 0
            ? ` — run ids: ${persistedRunIds.join(", ")}`
            : "";
        toast.success(`Evaluation complete — ${ranLabel}${runIdSuffix}`);
      },
      onError: (err) =>
        toast.error(`Trigger failed: ${err.message ?? "unknown"}`),
    });

  const parsedProvider = parsePositiveInt(providerConnectionId);
  const parsedWorkspace = parsePositiveInt(workspaceId);
  const parsedActor = parsePositiveInt(actorId);
  const parsedTimeout = parsePositiveInt(timeoutMs);
  const timeoutValid =
    parsedTimeout !== null &&
    parsedTimeout >= TIMEOUT_MIN_MS &&
    parsedTimeout <= TIMEOUT_MAX_MS;

  const formValid =
    parsedProvider !== null &&
    modelRef.trim().length > 0 &&
    parsedWorkspace !== null &&
    parsedActor !== null &&
    timeoutValid;

  function handleSubmit() {
    if (!formValid) return;
    triggerMut.mutate({
      providerConnectionId: parsedProvider as number,
      modelRef: modelRef.trim(),
      workspaceId: parsedWorkspace as number,
      actorId: parsedActor as number,
      ...(suiteKey !== "" ? { suiteKey } : {}),
      ...(parsedTimeout !== TIMEOUT_DEFAULT_MS
        ? { perQuestionTimeoutMs: parsedTimeout as number }
        : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <SectionLabel>Trigger live evaluation</SectionLabel>
        <p className="text-sm text-muted-foreground">
          Runs the seeded golden-question suites against the supplied
          provider connection + model. Results persist into
          <code className="mx-1">ags_golden_question_runs</code>
          and surface in this page's recent-runs list (continuation-13).
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="gq-provider-connection-id">
              Provider connection id
            </Label>
            <Input
              id="gq-provider-connection-id"
              data-testid="gq-provider-connection-id"
              type="number"
              min={1}
              value={providerConnectionId}
              onChange={(e) => setProviderConnectionId(e.target.value)}
              placeholder="e.g. 42"
            />
          </div>
          <div>
            <Label htmlFor="gq-model-ref">Model ref</Label>
            <Input
              id="gq-model-ref"
              data-testid="gq-model-ref"
              value={modelRef}
              onChange={(e) => setModelRef(e.target.value)}
              placeholder="e.g. anthropic/claude-3-5-sonnet"
            />
          </div>
          <div>
            <Label htmlFor="gq-workspace-id">Workspace id</Label>
            <Input
              id="gq-workspace-id"
              data-testid="gq-workspace-id"
              type="number"
              min={1}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              placeholder="e.g. 7"
            />
          </div>
          <div>
            <Label htmlFor="gq-actor-id">Actor (user) id</Label>
            <Input
              id="gq-actor-id"
              data-testid="gq-actor-id"
              type="number"
              min={1}
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              placeholder="e.g. 1"
            />
          </div>
          <div>
            <Label htmlFor="gq-suite-key">Suite (optional — all if blank)</Label>
            <select
              id="gq-suite-key"
              data-testid="gq-suite-key"
              className="w-full rounded border bg-background p-2 text-sm"
              value={suiteKey}
              onChange={(e) => setSuiteKey(e.target.value)}
              disabled={suitesQuery.isLoading}
            >
              <option value="">(all seeded suites)</option>
              {suites.map((s) => (
                <option key={s.suiteKey} value={s.suiteKey}>
                  {s.name} ({s.suiteKey}) — {s.questionCount} questions
                </option>
              ))}
            </select>
            {suitesQuery.isLoading ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Loading suites…
              </p>
            ) : suitesQuery.error ? (
              <p className="mt-1 text-xs text-destructive">
                Failed to load suites: {suitesQuery.error.message}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="gq-timeout">
              Per-question timeout (ms — {TIMEOUT_MIN_MS}–{TIMEOUT_MAX_MS})
            </Label>
            <Input
              id="gq-timeout"
              data-testid="gq-timeout"
              type="number"
              min={TIMEOUT_MIN_MS}
              max={TIMEOUT_MAX_MS}
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={!formValid || triggerMut.isPending}
            onClick={handleSubmit}
            data-testid="gq-trigger-submit"
          >
            {triggerMut.isPending ? "Running…" : "Run evaluation"}
          </Button>
          {!formValid ? (
            <span className="text-xs text-muted-foreground">
              Fill provider, model, workspace, actor, valid timeout to enable.
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
