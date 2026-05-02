/**
 * AI Agent Studio — Testing Page
 *
 * Suites + cases CRUD, batch run, latest results.
 *
 * Layout:
 *   left   = test suite list (create + select)
 *   center = test case list for selected suite (create + delete)
 *   right  = latest run results
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, PlayCircle, FlaskConical, Trash2 } from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  VerdictBadge,
} from "../components/ui";

export default function AgentTestingPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const suitesQuery = trpc.agentStudio.testing.listSuites.useQuery({ agentId });
  const runsQuery = trpc.agentStudio.testing.listRuns.useQuery({ agentId });
  const [newSuiteName, setNewSuiteName] = useState("");
  const [selectedSuiteId, setSelectedSuiteId] = useState<number | null>(null);

  // Case-creation form state
  const [caseName, setCaseName] = useState("");
  const [caseInputJson, setCaseInputJson] = useState('{"prompt":"Hello"}');

  const suiteDetailQuery = trpc.agentStudio.testing.getSuite.useQuery(
    { suiteId: selectedSuiteId ?? 0 },
    { enabled: selectedSuiteId !== null }
  );

  const saveSuiteMut = trpc.agentStudio.testing.saveSuite.useMutation({
    onSuccess: (created) => {
      toast.success("Suite created");
      setNewSuiteName("");
      utils.agentStudio.testing.listSuites.invalidate({ agentId });
      if (created) setSelectedSuiteId(created.id);
    },
    onError: (e) => toast.error(e.message),
  });

  const saveCaseMut = trpc.agentStudio.testing.saveCase.useMutation({
    onSuccess: () => {
      toast.success("Case added");
      setCaseName("");
      setCaseInputJson('{"prompt":"Hello"}');
      if (selectedSuiteId) {
        utils.agentStudio.testing.getSuite.invalidate({ suiteId: selectedSuiteId });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const removeCaseMut = trpc.agentStudio.testing.removeCase.useMutation({
    onSuccess: () => {
      toast.success("Case removed");
      if (selectedSuiteId) {
        utils.agentStudio.testing.getSuite.invalidate({ suiteId: selectedSuiteId });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const runSuiteMut = trpc.agentStudio.testing.runSuite.useMutation({
    onSuccess: (r) => {
      toast.success(`Run completed: ${r.passedCount} passed, ${r.failedCount} failed`);
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  if (suitesQuery.isLoading) return <LoadingState label="Loading test suites…" />;

  const suites = suitesQuery.data ?? [];
  const cases = suiteDetailQuery.data?.cases ?? [];

  const handleAddCase = () => {
    if (!selectedSuiteId || !caseName) return;
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(caseInputJson);
    } catch {
      toast.error("Invalid JSON");
      return;
    }
    saveCaseMut.mutate({
      suiteId: selectedSuiteId,
      name: caseName,
      inputPayload: payload,
    });
  };

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Testing"
        subtitle="Test suites, cases, and assertion-based runs against the agent"
        icon={<FlaskConical className="h-4 w-4 text-cyan-500" />}
      />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      {/* Suites */}
      <Card className="lg:col-span-3">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-cyan-500" /> Test Suites
          </h3>
          <div className="flex gap-2">
            <Input
              value={newSuiteName}
              onChange={(e) => setNewSuiteName(e.target.value)}
              placeholder="New suite name…"
              className="h-7 text-xs"
            />
            <Button
              size="sm"
              className="h-7"
              disabled={!newSuiteName || saveSuiteMut.isPending}
              onClick={() => saveSuiteMut.mutate({ agentId, name: newSuiteName })}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          {suites.length === 0 ? (
            <EmptyState
              compact
              title="No suites yet"
              description="Create one above."
            />
          ) : (
            <ul className="space-y-1">
              {suites.map((s: any) => (
                <li
                  key={s.id}
                  className={`border rounded p-2 text-xs cursor-pointer ${
                    selectedSuiteId === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                  }`}
                  onClick={() => setSelectedSuiteId(s.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium truncate">{s.name}</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        runSuiteMut.mutate({ suiteId: s.id });
                      }}
                      disabled={runSuiteMut.isPending}
                      title="Run suite"
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {s.description && (
                    <div className="text-[10px] text-muted-foreground">{s.description}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Cases */}
      <Card className="lg:col-span-5">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-base font-semibold">Cases</h3>
          {!selectedSuiteId ? (
            <p className="text-[10px] text-muted-foreground">Select a suite to view cases.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-muted-foreground/70">
                  Add Case
                </Label>
                <Input
                  value={caseName}
                  onChange={(e) => setCaseName(e.target.value)}
                  placeholder="Case name…"
                  className="h-7 text-xs"
                />
                <Textarea
                  value={caseInputJson}
                  onChange={(e) => setCaseInputJson(e.target.value)}
                  className="text-[10px] font-mono min-h-[80px]"
                  placeholder='{"prompt":"..."}'
                />
                <Button
                  size="sm"
                  className="h-7"
                  disabled={!caseName || saveCaseMut.isPending}
                  onClick={handleAddCase}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Case
                </Button>
              </div>

              <div className="border-t pt-2 mt-2">
                {cases.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground">
                    No cases in this suite yet.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {cases.map((c: any) => (
                      <li key={c.id} className="border rounded p-2 text-[10px]">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{c.name}</div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => removeCaseMut.mutate({ caseId: c.id })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <pre className="font-mono text-[9px] opacity-70 mt-1 whitespace-pre-wrap break-all">
                          {JSON.stringify(c.inputPayload, null, 0).slice(0, 120)}
                        </pre>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Run summary */}
      <Card className="lg:col-span-4">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-base font-semibold">Latest Run</h3>
          {!runSuiteMut.data ? (
            <p className="text-[10px] text-muted-foreground">Run a suite to see results.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Badge
                  className={
                    runSuiteMut.data.verdict === "pass"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-red-500/15 text-red-400 border border-red-500/30"
                  }
                >
                  {runSuiteMut.data.verdict.toUpperCase()}
                </Badge>
                <span className="text-xs text-emerald-400">
                  {runSuiteMut.data.passedCount} passed
                </span>
                <span className="text-xs text-red-400">
                  {runSuiteMut.data.failedCount} failed
                </span>
              </div>
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase text-muted-foreground/70">
                  <tr>
                    <th className="text-left py-1">Case</th>
                    <th className="text-left py-1">Verdict</th>
                    <th className="text-left py-1">Duration</th>
                    <th className="text-left py-1">Failure</th>
                  </tr>
                </thead>
                <tbody>
                  {runSuiteMut.data.results.map((r: any) => (
                    <tr key={r.caseId} className="border-t">
                      <td className="py-1">#{r.caseId}</td>
                      <td>
                        <Badge variant="outline" className="text-[9px]">
                          {r.verdict}
                        </Badge>
                      </td>
                      <td className="text-[10px]">{r.durationMs}ms</td>
                      <td className="text-[10px] text-red-400">{r.failureMessage ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Past runs from the database */}
          <div className="border-t pt-2 mt-3 space-y-1">
            <div className="text-[10px] uppercase text-muted-foreground/70 font-semibold">
              Past Runs
            </div>
            {(runsQuery.data?.length ?? 0) === 0 ? (
              <p className="text-[10px] text-muted-foreground">No past runs.</p>
            ) : (
              <ul className="space-y-1">
                {runsQuery.data?.slice(0, 8).map((r: any) => (
                  <li
                    key={r.id}
                    className="text-[10px] flex items-center justify-between border rounded p-1.5"
                  >
                    <span>
                      <strong>#{r.id}</strong> · suite {r.suiteId}
                    </span>
                    <span>
                      <Badge variant="outline" className="text-[9px] mr-1">
                        {r.verdict ?? r.status}
                      </Badge>
                      <span className="text-emerald-400">{r.passedCount ?? 0}p</span>
                      {" / "}
                      <span className="text-red-400">{r.failedCount ?? 0}f</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
