// GraphAgentAdminPanel — no-deferral continuation-31 slice 126.
//
// Closes the partial-consumer gap on `graphAgent.{health, run,
// exportTraceMarkdown, exportTraceToNote}` — 4 unconsumed endpoints.

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

const AGENT_KINDS = ["graph_agent_lite", "graph_agent_advanced"] as const;
type AgentKind = (typeof AGENT_KINDS)[number];

const RETRIEVAL_PREFS = [
  "auto",
  "graphrag_local",
  "graphrag_global",
  "graphrag_traversal",
  "hybrid_cag_graphrag",
] as const;
type RetrievalPref = (typeof RETRIEVAL_PREFS)[number];

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function GraphAgentAdminPanel() {
  return (
    <div className="space-y-4" data-testid="ga-panel">
      <HealthCard />
      <RunCard />
      <ExportCard />
    </div>
  );
}

function HealthCard() {
  const healthQuery = trpc.agentStudio.graphAgent.health.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <SectionLabel>Health</SectionLabel>
        {healthQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : healthQuery.error ? (
          <p
            className="text-sm text-destructive"
            data-testid="ga-health-error"
          >
            {healthQuery.error.message}
          </p>
        ) : healthQuery.data ? (
          <pre
            className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
            data-testid="ga-health-json"
          >
            {JSON.stringify(healthQuery.data, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RunCard() {
  const [agentKey, setAgentKey] = useState<AgentKind>("graph_agent_lite");
  const [query, setQuery] = useState("");
  const [retrieval, setRetrieval] = useState<RetrievalPref>("auto");
  const [maxSteps, setMaxSteps] = useState("8");
  const [modelHint, setModelHint] = useState("");

  const parsedMaxSteps = parsePositiveInt(maxSteps);
  const formValid =
    query.trim().length > 0 &&
    parsedMaxSteps !== null &&
    parsedMaxSteps >= 1 &&
    parsedMaxSteps <= 20;

  const runMut = trpc.agentStudio.graphAgent.run.useMutation({
    onSuccess: () =>
      toast.success(
        `Agent run complete (steps: ${parsedMaxSteps ?? "?"})`,
      ),
    onError: (err) => toast.error(`Run failed: ${err.message ?? "unknown"}`),
  });

  function handleRun() {
    if (!formValid) return;
    runMut.mutate({
      agentKey,
      query,
      retrievalPreference: retrieval,
      maxSteps: parsedMaxSteps as number,
      ...(modelHint.trim() !== "" ? { modelHint: modelHint.trim() } : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Run agent</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ga-agent">Agent kind</Label>
            <select
              id="ga-agent"
              data-testid="ga-run-agent-kind"
              className="w-full rounded border bg-background p-2 text-sm"
              value={agentKey}
              onChange={(e) => setAgentKey(e.target.value as AgentKind)}
            >
              {AGENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ga-retrieval">Retrieval preference</Label>
            <select
              id="ga-retrieval"
              data-testid="ga-run-retrieval"
              className="w-full rounded border bg-background p-2 text-sm"
              value={retrieval}
              onChange={(e) => setRetrieval(e.target.value as RetrievalPref)}
            >
              {RETRIEVAL_PREFS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ga-max-steps">Max steps (1-20)</Label>
            <Input
              id="ga-max-steps"
              data-testid="ga-run-max-steps"
              type="number"
              min={1}
              max={20}
              value={maxSteps}
              onChange={(e) => setMaxSteps(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ga-model-hint">Model hint (optional)</Label>
            <Input
              id="ga-model-hint"
              data-testid="ga-run-model-hint"
              value={modelHint}
              onChange={(e) => setModelHint(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ga-query">Query</Label>
            <textarea
              id="ga-query"
              data-testid="ga-run-query"
              className="w-full rounded border bg-background p-2 font-mono text-xs"
              rows={4}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={8000}
            />
          </div>
        </div>
        <Button
          type="button"
          disabled={!formValid || runMut.isPending}
          onClick={handleRun}
          data-testid="ga-run-button"
        >
          {runMut.isPending ? "Running…" : "Run agent"}
        </Button>
        {runMut.data ? (
          <pre
            className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
            data-testid="ga-run-result"
          >
            {JSON.stringify(runMut.data, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ExportCard() {
  const [markdownRunId, setMarkdownRunId] = useState("");
  const [markdownTitle, setMarkdownTitle] = useState("");
  const [markdownRedact, setMarkdownRedact] = useState(true);
  const [noteRunId, setNoteRunId] = useState("");
  const [noteVaultId, setNoteVaultId] = useState("");
  const [noteFolderId, setNoteFolderId] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteRedact, setNoteRedact] = useState(true);
  const [noteOverwrite, setNoteOverwrite] = useState(false);

  const parsedMarkdownRun = parsePositiveInt(markdownRunId);
  const exportQuery =
    trpc.agentStudio.graphAgent.exportTraceMarkdown.useQuery(
      parsedMarkdownRun !== null
        ? {
            runId: parsedMarkdownRun,
            ...(markdownTitle.trim() !== ""
              ? { title: markdownTitle.trim() }
              : {}),
            redact: markdownRedact,
          }
        : (undefined as never),
      { enabled: parsedMarkdownRun !== null, refetchOnWindowFocus: false },
    );

  const parsedNoteRun = parsePositiveInt(noteRunId);
  const parsedNoteVault = parsePositiveInt(noteVaultId);
  const parsedNoteFolder = parsePositiveInt(noteFolderId);
  const noteValid = parsedNoteRun !== null && parsedNoteVault !== null;

  const noteMut = trpc.agentStudio.graphAgent.exportTraceToNote.useMutation({
    onSuccess: () => {
      toast.success("Trace exported to note");
      setNoteTitle("");
    },
    onError: (err) =>
      toast.error(`Export to note failed: ${err.message ?? "unknown"}`),
  });

  function handleExportToNote() {
    if (!noteValid) return;
    noteMut.mutate({
      runId: parsedNoteRun as number,
      vaultId: parsedNoteVault as number,
      ...(parsedNoteFolder !== null ? { folderId: parsedNoteFolder } : {}),
      ...(noteTitle.trim() !== "" ? { title: noteTitle.trim() } : {}),
      redact: noteRedact,
      ...(noteOverwrite ? { overwrite: true } : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Export trace</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Export to markdown</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ga-em-run">Run id</Label>
              <Input
                id="ga-em-run"
                data-testid="ga-em-run-id"
                type="number"
                min={1}
                value={markdownRunId}
                onChange={(e) => setMarkdownRunId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ga-em-title">Title (optional)</Label>
              <Input
                id="ga-em-title"
                data-testid="ga-em-title"
                value={markdownTitle}
                onChange={(e) => setMarkdownTitle(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="ga-em-redact"
              checked={markdownRedact}
              onChange={(e) => setMarkdownRedact(e.target.checked)}
            />
            Redact (default on)
          </label>
          {parsedMarkdownRun !== null && exportQuery.data ? (
            <pre
              className="max-h-64 overflow-x-auto overflow-y-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="ga-em-result"
            >
              {String(
                (exportQuery.data as { exported?: string | null }).exported ??
                  "(no trace available)",
              )}
            </pre>
          ) : null}
          {parsedMarkdownRun !== null && exportQuery.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="ga-em-error"
            >
              {exportQuery.error.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Export to vault note</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ga-en-run">Run id</Label>
              <Input
                id="ga-en-run"
                data-testid="ga-en-run-id"
                type="number"
                min={1}
                value={noteRunId}
                onChange={(e) => setNoteRunId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ga-en-vault">Vault id</Label>
              <Input
                id="ga-en-vault"
                data-testid="ga-en-vault-id"
                type="number"
                min={1}
                value={noteVaultId}
                onChange={(e) => setNoteVaultId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ga-en-folder">Folder id (optional)</Label>
              <Input
                id="ga-en-folder"
                data-testid="ga-en-folder-id"
                type="number"
                min={1}
                value={noteFolderId}
                onChange={(e) => setNoteFolderId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ga-en-title">Title (optional)</Label>
              <Input
                id="ga-en-title"
                data-testid="ga-en-title"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="ga-en-redact"
                checked={noteRedact}
                onChange={(e) => setNoteRedact(e.target.checked)}
              />
              Redact (default on)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="ga-en-overwrite"
                checked={noteOverwrite}
                onChange={(e) => setNoteOverwrite(e.target.checked)}
              />
              Overwrite existing
            </label>
          </div>
          <Button
            type="button"
            disabled={!noteValid || noteMut.isPending}
            onClick={handleExportToNote}
            data-testid="ga-en-button"
          >
            {noteMut.isPending ? "Exporting…" : "Export to note"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
