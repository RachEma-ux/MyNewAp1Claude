/**
 * KGIA — Knowledge Graph Interpretation Agent — Workspace Page
 *
 * Tabs: Query (main), Sources, Sessions, Audit
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Network,
  Play,
  Plus,
  Database,
  History,
  Shield,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Search,
} from "lucide-react";

type Tab = "query" | "sources" | "sessions" | "audit";

export function KgiaPage({ workspaceId }: { workspaceId: number }) {
  const [tab, setTab] = useState<Tab>("query");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Knowledge Graph Interpreter</h1>
        </div>
        <div className="flex gap-1">
          {(["query", "sources", "sessions", "audit"] as Tab[]).map((t) => (
            <Button
              key={t}
              variant={tab === t ? "default" : "ghost"}
              size="sm"
              onClick={() => setTab(t)}
              className="capitalize"
            >
              {t === "query" && <Search className="h-3.5 w-3.5 mr-1" />}
              {t === "sources" && <Database className="h-3.5 w-3.5 mr-1" />}
              {t === "sessions" && <History className="h-3.5 w-3.5 mr-1" />}
              {t === "audit" && <Shield className="h-3.5 w-3.5 mr-1" />}
              {t}
            </Button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {tab === "query" && <QueryTab workspaceId={workspaceId} />}
        {tab === "sources" && <SourcesTab workspaceId={workspaceId} />}
        {tab === "sessions" && <SessionsTab workspaceId={workspaceId} />}
        {tab === "audit" && <AuditTab workspaceId={workspaceId} />}
      </div>
    </div>
  );
}

// ── Query Tab ───────────────────────────────────────────────────

function QueryTab({ workspaceId }: { workspaceId: number }) {
  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [result, setResult] = useState<any>(null);

  const createSession = trpc.modules.kgia.sessions.create.useMutation();
  const executeRun = trpc.modules.kgia.runs.execute.useMutation();
  const { data: sessions } = trpc.modules.kgia.sessions.list.useQuery({ workspaceId });
  const { data: sources } = trpc.modules.kgia.sources.list.useQuery({ workspaceId });

  const handleSubmit = async () => {
    if (!question.trim()) return;

    let sid = sessionId;
    if (!sid) {
      const res = await createSession.mutateAsync({ workspaceId, title: question.slice(0, 100) });
      sid = res.id;
      setSessionId(sid);
    }

    const res = await executeRun.mutateAsync({
      workspaceId,
      sessionId: sid,
      question: question.trim(),
    });
    setResult(res);
  };

  const isLoading = createSession.isPending || executeRun.isPending;

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Source status */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Database className="h-3 w-3" />
        <span>{sources?.length ?? 0} graph source(s) configured</span>
        {sources?.length === 0 && (
          <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500">
            Add sources first
          </Badge>
        )}
      </div>

      {/* Question input */}
      <div className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about your knowledge graph..."
          className="flex-1"
          onKeyDown={(e) => e.key === "Enter" && !isLoading && handleSubmit()}
        />
        <Button onClick={handleSubmit} disabled={isLoading || !question.trim()}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          <span className="ml-1">Run</span>
        </Button>
      </div>

      {/* Active session */}
      {sessionId && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Session #{sessionId}</span>
          <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => { setSessionId(null); setResult(null); }}>
            New session
          </Button>
        </div>
      )}

      {/* Result */}
      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {"envelope" in result ? (
                <><CheckCircle2 className="h-4 w-4 text-green-500" /> Answer</>
              ) : (
                <><XCircle className="h-4 w-4 text-red-500" /> Error</>
              )}
              <Badge variant="outline" className="text-[10px] ml-auto">
                Run #{result.runId}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {"envelope" in result ? (
              <>
                <p className="text-sm whitespace-pre-wrap">{result.envelope.answer}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <MetricCard label="Confidence" value={`${Math.round(result.envelope.confidence.overall * 100)}%`} />
                  <MetricCard label="Mode" value={result.envelope.selectedMode} />
                  <MetricCard label="Evidence" value={`${result.envelope.evidenceGraph.nodes.length} nodes`} />
                  <MetricCard label="Provenance" value={`${result.envelope.provenanceRefs.length} refs`} />
                </div>
                {result.envelope.observedFacts.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">Observed Facts</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {result.envelope.observedFacts.slice(0, 5).map((f: string, i: number) => (
                        <li key={i} className="flex items-start gap-1">
                          <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="line-clamp-1">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.envelope.missingKnowledge.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1 text-amber-500">Missing Knowledge</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {result.envelope.missingKnowledge.map((m: string, i: number) => (
                        <li key={i} className="flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!result.envelope.governanceVerdict.safe && (
                  <div className="border border-red-500/30 bg-red-500/5 rounded p-2">
                    <p className="text-xs font-medium text-red-500">Governance Violations</p>
                    <ul className="text-xs text-muted-foreground mt-1">
                      {result.envelope.governanceVerdict.violations.map((v: string, i: number) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-red-500">{result.error}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent runs */}
      <RecentRuns workspaceId={workspaceId} sessionId={sessionId} />
    </div>
  );
}

function RecentRuns({ workspaceId, sessionId }: { workspaceId: number; sessionId: number | null }) {
  const { data: runs } = trpc.modules.kgia.runs.list.useQuery(
    { workspaceId, sessionId: sessionId ?? undefined, limit: 10 },
  );

  if (!runs || runs.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">Recent Runs</p>
      <div className="space-y-1">
        {runs.map((run) => (
          <div key={run.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent">
            <StatusDot status={run.status} />
            <span className="flex-1 truncate">{run.question}</span>
            {run.confidence != null && (
              <Badge variant="outline" className="text-[10px]">{Math.round(run.confidence * 100)}%</Badge>
            )}
            {run.selectedMode && (
              <Badge variant="outline" className="text-[10px]">{run.selectedMode}</Badge>
            )}
            {run.durationMs != null && (
              <span className="text-muted-foreground">{run.durationMs}ms</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sources Tab ─────────────────────────────────────────────────

function SourcesTab({ workspaceId }: { workspaceId: number }) {
  const [showAdd, setShowAdd] = useState(false);
  const { data: sources, refetch } = trpc.modules.kgia.sources.list.useQuery({ workspaceId });
  const createSource = trpc.modules.kgia.sources.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); } });
  const testConn = trpc.modules.kgia.sources.testConnection.useMutation();

  const [form, setForm] = useState({
    name: "", type: "neo4j" as const, endpoint: "", maxHops: 4, maxRows: 1000, readOnly: true,
  });

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Graph Sources</h2>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Source
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Name</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My Neo4j DB" />
              </div>
              <div>
                <label className="text-xs font-medium">Type</label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                >
                  <option value="neo4j">Neo4j</option>
                  <option value="sparql">SPARQL</option>
                  <option value="neptune_cypher">Neptune (Cypher)</option>
                  <option value="neptune_sparql">Neptune (SPARQL)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Endpoint</label>
              <Input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="bolt://graph.example.com:7687" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium">Max Hops</label>
                <Input type="number" value={form.maxHops} onChange={(e) => setForm({ ...form, maxHops: parseInt(e.target.value) || 4 })} />
              </div>
              <div>
                <label className="text-xs font-medium">Max Rows</label>
                <Input type="number" value={form.maxRows} onChange={(e) => setForm({ ...form, maxRows: parseInt(e.target.value) || 1000 })} />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <input type="checkbox" checked={form.readOnly} onChange={(e) => setForm({ ...form, readOnly: e.target.checked })} id="ro" />
                <label htmlFor="ro" className="text-xs">Read-only</label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => createSource.mutate({ workspaceId, ...form })}
                disabled={!form.name || !form.endpoint || createSource.isPending}
              >
                {createSource.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sources?.length === 0 && !showAdd && (
        <div className="text-center py-12 text-muted-foreground">
          <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No graph sources configured</p>
          <p className="text-xs mt-1">Add a Neo4j or SPARQL endpoint to get started</p>
        </div>
      )}

      <div className="space-y-2">
        {sources?.map((source) => (
          <Card key={source.id}>
            <CardContent className="py-3 flex items-center gap-3">
              <Database className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{source.name}</p>
                <p className="text-xs text-muted-foreground truncate">{source.endpoint}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{source.type}</Badge>
              <Badge variant={source.status === "active" ? "default" : "secondary"} className="text-[10px]">
                {source.status}
              </Badge>
              {source.allowlisted && <Badge className="text-[10px] bg-green-600">allowlisted</Badge>}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => testConn.mutate({ id: source.id, workspaceId })}
                disabled={testConn.isPending}
              >
                Test
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Sessions Tab ────────────────────────────────────────────────

function SessionsTab({ workspaceId }: { workspaceId: number }) {
  const { data: sessions } = trpc.modules.kgia.sessions.list.useQuery({ workspaceId });

  return (
    <div className="space-y-4 max-w-4xl">
      <h2 className="text-sm font-medium">Interpretation Sessions</h2>

      {sessions?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No sessions yet</p>
          <p className="text-xs mt-1">Start a query to create your first session</p>
        </div>
      )}

      <div className="space-y-2">
        {sessions?.map((session) => (
          <Card key={session.id}>
            <CardContent className="py-3 flex items-center gap-3">
              <History className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{session.title || `Session #${session.id}`}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(session.createdAt).toLocaleString()}
                </p>
              </div>
              <Badge variant={session.status === "active" ? "default" : "secondary"} className="text-[10px]">
                {session.status}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Audit Tab ───────────────────────────────────────────────────

function AuditTab({ workspaceId }: { workspaceId: number }) {
  const { data: decisions } = trpc.modules.kgia.audit.list.useQuery({ workspaceId, limit: 50 });

  return (
    <div className="space-y-4 max-w-4xl">
      <h2 className="text-sm font-medium">Governance Audit Trail</h2>

      {decisions?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No policy decisions yet</p>
        </div>
      )}

      <div className="space-y-1">
        {decisions?.map((d) => (
          <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent">
            {d.decision === "allow" && <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />}
            {d.decision === "deny" && <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
            {d.decision === "review_required" && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
            <Badge variant="outline" className="text-[10px]">{d.action}</Badge>
            <span className="flex-1 truncate text-muted-foreground">{d.reason}</span>
            {d.policyRule && <Badge variant="secondary" className="text-[10px]">{d.policyRule}</Badge>}
            <span className="text-muted-foreground shrink-0">
              {new Date(d.createdAt).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared Components ───────────────────────────────────────────

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium">{value}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "completed" ? "bg-green-500" :
    status === "running" ? "bg-blue-500 animate-pulse" :
    status === "error" ? "bg-red-500" :
    "bg-gray-400";
  return <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${color}`} />;
}
