// ProviderBindingsAdminPanel — no-deferral continuation-29 slice 120.
//
// Closes the partial-consumer gap on `providerBindings.*` (4
// unconsumed endpoints; 7 already consumed by the per-agent
// binding picker shipped at Plan v3 Phase 14).
//
// 3 cards:
//   - List for agent (listForAgent)
//   - Resolve + Remove by (draftId, role?) — both share the same key
//     input; Resolve is a query, Remove is a mutation.
//   - Test run with binding (testRunWithBinding) — Phase 16
//     binding-driven test run with policy + Model Access gate.

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

const TEST_RUN_INTENTS = [
  "",
  "agent-test",
  "agent-run",
  "evaluation",
  "chat",
] as const;
type TestRunIntent = (typeof TEST_RUN_INTENTS)[number];

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseFloatInRange(
  s: string,
  min: number,
  max: number,
): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function ProviderBindingsAdminPanel() {
  return (
    <div className="space-y-4" data-testid="pb-panel">
      <ListForAgentCard />
      <ResolveAndRemoveCard />
      <TestRunCard />
    </div>
  );
}

function ListForAgentCard() {
  const [agentId, setAgentId] = useState("");
  const parsed = parsePositiveInt(agentId);

  const query = trpc.agentStudio.providerBindings.listForAgent.useQuery(
    parsed !== null ? { agentId: parsed } : (undefined as never),
    { enabled: parsed !== null, refetchOnWindowFocus: false },
  );

  const rows = (query.data ?? []) as Array<{
    draftId: number;
    role: string;
    modelRef?: string | null;
    status?: string;
  }>;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>List bindings for agent</SectionLabel>
        <div>
          <Label htmlFor="pb-agent-id">Agent id</Label>
          <Input
            id="pb-agent-id"
            data-testid="pb-agent-id"
            type="number"
            min={1}
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          />
        </div>
        {parsed !== null ? (
          query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : query.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="pb-list-error"
            >
              {query.error.message}
            </p>
          ) : rows.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="pb-list-empty"
            >
              No bindings for this agent.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="pb-list-rows">
              {rows.map((b) => (
                <li
                  key={`${b.draftId}::${b.role}`}
                  data-testid="pb-list-row"
                  className="rounded border bg-background p-2 font-mono text-xs"
                >
                  draft#{b.draftId} role={b.role}{" "}
                  {b.modelRef ? `· ${b.modelRef}` : ""}{" "}
                  {b.status ? `· ${b.status}` : ""}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResolveAndRemoveCard() {
  const [draftId, setDraftId] = useState("");
  const [role, setRole] = useState("");
  const utils = trpc.useUtils();

  const parsedDraft = parsePositiveInt(draftId);
  const formValid = parsedDraft !== null;
  const roleArg = role.trim() === "" ? undefined : role.trim();

  const resolveQuery = trpc.agentStudio.providerBindings.resolveForRun.useQuery(
    parsedDraft !== null
      ? roleArg !== undefined
        ? { draftId: parsedDraft, role: roleArg }
        : { draftId: parsedDraft }
      : (undefined as never),
    { enabled: parsedDraft !== null, refetchOnWindowFocus: false },
  );

  const removeMut = trpc.agentStudio.providerBindings.remove.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Remove draft#${parsedDraft} (${roleArg ?? "primary"}): ${
          (res as { removed?: unknown }).removed ? "removed" : "noop"
        }`,
      );
      void utils.agentStudio.providerBindings.listForAgent.invalidate();
      void utils.agentStudio.providerBindings.resolveForRun.invalidate();
    },
    onError: (err) =>
      toast.error(`Remove failed: ${err.message ?? "unknown"}`),
  });

  function handleRemove() {
    if (!formValid) return;
    if (
      !window.confirm(
        `Remove binding draft#${parsedDraft} (role=${roleArg ?? "primary"})?`,
      )
    ) {
      return;
    }
    removeMut.mutate({
      draftId: parsedDraft as number,
      ...(roleArg !== undefined ? { role: roleArg } : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Resolve + remove by binding key</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="pb-rr-draft">Draft id</Label>
            <Input
              id="pb-rr-draft"
              data-testid="pb-rr-draft-id"
              type="number"
              min={1}
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pb-rr-role">Role (optional, default "primary")</Label>
            <Input
              id="pb-rr-role"
              data-testid="pb-rr-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={32}
              placeholder="primary"
            />
          </div>
        </div>
        {parsedDraft !== null && resolveQuery.data ? (
          <pre
            className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
            data-testid="pb-resolve-json"
          >
            {JSON.stringify(resolveQuery.data, null, 2)}
          </pre>
        ) : null}
        {parsedDraft !== null && resolveQuery.error ? (
          <p
            className="text-sm text-destructive"
            data-testid="pb-resolve-error"
          >
            Resolve failed: {resolveQuery.error.message}
          </p>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          disabled={!formValid || removeMut.isPending}
          onClick={handleRemove}
          data-testid="pb-remove-button"
        >
          {removeMut.isPending ? "Removing…" : "Remove"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TestRunCard() {
  const [draftId, setDraftId] = useState("");
  const [role, setRole] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [intent, setIntent] = useState<TestRunIntent>("");
  const [temperature, setTemperature] = useState("");
  const [tokenBudget, setTokenBudget] = useState("");
  const [correlationId, setCorrelationId] = useState("");

  const parsedDraft = parsePositiveInt(draftId);
  const parsedWorkspace = parsePositiveInt(workspaceId);
  const parsedTemperature =
    temperature.trim() === ""
      ? undefined
      : parseFloatInRange(temperature, 0, 2);
  const tempValid =
    temperature.trim() === "" ||
    (parsedTemperature !== null && parsedTemperature !== undefined);
  const parsedTokenBudget =
    tokenBudget.trim() === "" ? undefined : parsePositiveInt(tokenBudget);
  const tokenValid =
    tokenBudget.trim() === "" ||
    (parsedTokenBudget !== null && parsedTokenBudget !== undefined);

  const formValid =
    parsedDraft !== null &&
    parsedWorkspace !== null &&
    prompt.trim().length > 0 &&
    tempValid &&
    tokenValid;

  const runMut =
    trpc.agentStudio.providerBindings.testRunWithBinding.useMutation({
      onSuccess: () => toast.success("Test run complete"),
      onError: (err) =>
        toast.error(`Test run failed: ${err.message ?? "unknown"}`),
    });

  function handleRun() {
    if (!formValid) return;
    runMut.mutate({
      draftId: parsedDraft as number,
      ...(role.trim() !== "" ? { role: role.trim() } : {}),
      workspaceId: parsedWorkspace as number,
      prompt,
      ...(systemPrompt.trim() !== ""
        ? { systemPrompt: systemPrompt.trim() }
        : {}),
      ...(intent !== ""
        ? {
            intent: intent as
              | "agent-test"
              | "agent-run"
              | "evaluation"
              | "chat",
          }
        : {}),
      ...(parsedTemperature !== undefined && parsedTemperature !== null
        ? { temperature: parsedTemperature }
        : {}),
      ...(parsedTokenBudget !== undefined && parsedTokenBudget !== null
        ? { tokenBudget: parsedTokenBudget }
        : {}),
      ...(correlationId.trim() !== ""
        ? { correlationId: correlationId.trim() }
        : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Test run with binding</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="pb-tr-draft">Draft id</Label>
            <Input
              id="pb-tr-draft"
              data-testid="pb-tr-draft-id"
              type="number"
              min={1}
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pb-tr-role">Role (optional)</Label>
            <Input
              id="pb-tr-role"
              data-testid="pb-tr-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={32}
            />
          </div>
          <div>
            <Label htmlFor="pb-tr-ws">Workspace id</Label>
            <Input
              id="pb-tr-ws"
              data-testid="pb-tr-workspace-id"
              type="number"
              min={1}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pb-tr-intent">Intent (optional)</Label>
            <select
              id="pb-tr-intent"
              data-testid="pb-tr-intent"
              className="w-full rounded border bg-background p-2 text-sm"
              value={intent}
              onChange={(e) => setIntent(e.target.value as TestRunIntent)}
            >
              {TEST_RUN_INTENTS.map((i) =>
                i === "" ? (
                  <option key="empty" value="">
                    (default)
                  </option>
                ) : (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pb-tr-prompt">Prompt</Label>
            <textarea
              id="pb-tr-prompt"
              data-testid="pb-tr-prompt"
              className="w-full rounded border bg-background p-2 font-mono text-xs"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pb-tr-system">System prompt (optional)</Label>
            <textarea
              id="pb-tr-system"
              data-testid="pb-tr-system-prompt"
              className="w-full rounded border bg-background p-2 font-mono text-xs"
              rows={2}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pb-tr-temp">Temperature (0-2, optional)</Label>
            <Input
              id="pb-tr-temp"
              data-testid="pb-tr-temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pb-tr-token">Token budget (optional)</Label>
            <Input
              id="pb-tr-token"
              data-testid="pb-tr-token-budget"
              type="number"
              min={1}
              value={tokenBudget}
              onChange={(e) => setTokenBudget(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pb-tr-corr">Correlation id (optional)</Label>
            <Input
              id="pb-tr-corr"
              data-testid="pb-tr-correlation-id"
              value={correlationId}
              onChange={(e) => setCorrelationId(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          disabled={!formValid || runMut.isPending}
          onClick={handleRun}
          data-testid="pb-tr-run-button"
        >
          {runMut.isPending ? "Running…" : "Run with binding"}
        </Button>
        {runMut.data ? (
          <pre
            className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
            data-testid="pb-tr-result"
          >
            {JSON.stringify(runMut.data, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
