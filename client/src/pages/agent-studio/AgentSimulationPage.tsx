/**
 * AI Agent Studio — Simulation Page
 *
 * Core requirement: dry-run behavior analysis. NOT testing.
 *
 * Layout:
 *   left: scenario builder
 *   center: execution timeline
 *   right: governance/risk/cost/memory summary
 *   bottom: logs/traces/outputs/warnings
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, PlayCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PageHeader,
  EmptyState,
  VerdictBadge,
  SectionLabel,
} from "@/components/agent-studio/ui";

export default function AgentSimulationPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const scenariosQuery = trpc.agentStudio.simulation.listScenarios.useQuery({ agentId });

  const [scenarioName, setScenarioName] = useState("");
  // Phase 19 follow-up: defaults to empty so the textarea shows its
  // placeholder (which explains "plain text OR JSON"). Users no longer
  // have to delete the pre-filled {"prompt":"Hello"} before typing.
  const [inputJson, setInputJson] = useState("");
  const [toggles, setToggles] = useState({
    mockedTools: true,
    sandboxMemory: true,
    strictPolicy: true,
    fullOrchestration: false,
    stepByStep: false,
  });

  const saveScenarioMut = trpc.agentStudio.simulation.saveScenario.useMutation({
    onSuccess: () => {
      toast.success("Scenario saved");
      utils.agentStudio.simulation.listScenarios.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const runMut = trpc.agentStudio.simulation.run.useMutation({
    onSuccess: () => {
      toast.success("Simulation completed");
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  /**
   * Parse the Scenario textarea transparently:
   *  - If the text parses as JSON, use it as-is (advanced users can
   *    still pass full {"prompt": "...", "context": {...}} payloads)
   *  - If it doesn't parse AND doesn't obviously look like JSON (no
   *    leading `{` or `[`), wrap it as a plain prompt: {"prompt": <text>}
   *  - If it starts with `{` or `[` but fails to parse, surface the
   *    actual JSON parse error (position + reason) so the user can fix it
   *
   * This makes "paste a prompt with real newlines" just work — users
   * don't need to escape \n inside JSON strings. The JSON path is still
   * there for power users who want structured input.
   */
  const parseScenarioInput = (): {
    ok: boolean;
    payload?: Record<string, any>;
    error?: string;
  } => {
    const text = inputJson.trim();
    if (text === "") {
      return { ok: true, payload: { prompt: "" } };
    }
    // Heuristic: if it starts with { or [, user intended JSON → strict parse
    const looksLikeJson = text.startsWith("{") || text.startsWith("[");
    if (looksLikeJson) {
      try {
        const parsed = JSON.parse(text);
        return { ok: true, payload: parsed };
      } catch (e) {
        return {
          ok: false,
          error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}. Tip: newlines inside JSON strings need to be escaped as \\n, or just type plain text — we'll wrap it as {"prompt": "..."} automatically.`,
        };
      }
    }
    // Plain text — wrap it
    return { ok: true, payload: { prompt: text } };
  };

  const handleRun = () => {
    const parsed = parseScenarioInput();
    if (!parsed.ok) {
      toast.error(parsed.error ?? "Invalid scenario input");
      return;
    }
    runMut.mutate({ agentId, inputPayload: parsed.payload!, toggles });
  };

  const handleSaveScenario = () => {
    const parsed = parseScenarioInput();
    if (!parsed.ok) {
      toast.error(parsed.error ?? "Invalid scenario input");
      return;
    }
    saveScenarioMut.mutate({
      agentId,
      name: scenarioName,
      inputPayload: parsed.payload!,
      toggles,
    });
  };

  const result = runMut.data;

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Simulation"
        subtitle="Dry-run behavior analysis. NOT testing — see Testing for assertions."
        icon={<Sparkles className="h-4 w-4 text-purple-500" />}
        badges={
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-400 uppercase tracking-wider font-medium ml-2">
            Mocked Run
          </span>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      {/* Left: scenario builder */}
      <Card className="lg:col-span-3">
        <CardContent className="p-3 space-y-2">
          <h3 className="text-sm font-semibold">Scenario Builder</h3>
          <Field label="Name">
            <Input
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="Short label for saving this scenario"
              className="h-7 text-xs"
            />
          </Field>
          <Field label="Scenario">
            <Textarea
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              placeholder={`Describe what the agent should do, e.g.:

Monitor Postgres slow queries and summarize them daily.

— or for advanced control —

{"prompt": "...", "context": {"...": "..."}}`}
              className="text-[10px] font-mono min-h-[120px]"
            />
          </Field>
          <div className="text-[10px] uppercase text-muted-foreground/70 font-semibold mt-2">
            Toggles
          </div>
          <Toggle label="Mocked tools" checked={toggles.mockedTools} onChange={(v) => setToggles({ ...toggles, mockedTools: v })} />
          <Toggle label="Sandbox memory" checked={toggles.sandboxMemory} onChange={(v) => setToggles({ ...toggles, sandboxMemory: v })} />
          <Toggle label="Strict policy" checked={toggles.strictPolicy} onChange={(v) => setToggles({ ...toggles, strictPolicy: v })} />
          <Toggle label="Full orchestration" checked={toggles.fullOrchestration} onChange={(v) => setToggles({ ...toggles, fullOrchestration: v })} />
          <Toggle label="Step-by-step" checked={toggles.stepByStep} onChange={(v) => setToggles({ ...toggles, stepByStep: v })} />

          <div className="flex gap-1 pt-2">
            <Button size="sm" className="h-7 flex-1" onClick={handleRun} disabled={runMut.isPending}>
              {runMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              <PlayCircle className="h-3 w-3 mr-1" /> Run
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={handleSaveScenario} disabled={!scenarioName}>
              Save
            </Button>
          </div>

          {scenariosQuery.data && scenariosQuery.data.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] uppercase text-muted-foreground/70 font-semibold mb-1">
                Saved scenarios
              </div>
              <ul className="space-y-0.5">
                {scenariosQuery.data.map((s: any) => (
                  <li
                    key={s.id}
                    className="text-[10px] truncate cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5"
                    onClick={() => {
                      // Load the scenario into the form so the user can run it
                      setScenarioName(s.name);
                      try {
                        setInputJson(JSON.stringify(s.inputPayload ?? {}, null, 2));
                      } catch {
                        setInputJson("{}");
                      }
                      const t = (s.toggles ?? {}) as Record<string, boolean>;
                      setToggles({
                        mockedTools: t.mockedTools ?? true,
                        sandboxMemory: t.sandboxMemory ?? true,
                        strictPolicy: t.strictPolicy ?? true,
                        fullOrchestration: t.fullOrchestration ?? false,
                        stepByStep: t.stepByStep ?? false,
                      });
                      toast.success(`Loaded scenario: ${s.name}`);
                    }}
                    title="Click to load into the form"
                  >
                    · {s.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Center: execution timeline */}
      <Card className="lg:col-span-6">
        <CardContent className="p-3">
          <h3 className="text-sm font-semibold flex items-center gap-1 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-purple-500" /> Execution Timeline
          </h3>
          {!result ? (
            <EmptyState
              icon={<PlayCircle className="h-6 w-6" />}
              title="No run yet"
              description="Configure a scenario and click Run."
              compact
            />
          ) : (
            <ol className="space-y-1.5">
              {result.steps.map((s: any) => (
                <li key={s.index} className="border-l-2 pl-2 text-[10px]" style={{ borderColor: stepColor(s.verdict) }}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px]">
                      {s.type}
                    </Badge>
                    <span className="font-medium">{s.label}</span>
                    <span className={cn("ml-auto", verdictColor(s.verdict))}>{s.verdict}</span>
                    <span className="text-muted-foreground/60">{s.durationMs}ms</span>
                  </div>
                  <pre className="text-[9px] font-mono opacity-70 mt-1 whitespace-pre-wrap break-all">
                    {JSON.stringify(s.payload, null, 0).slice(0, 200)}
                  </pre>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Right: gov/risk/cost summary */}
      <Card className="lg:col-span-3">
        <CardContent className="p-3 space-y-2">
          <h3 className="text-sm font-semibold">Run Summary</h3>
          {result ? (
            <>
              <Stat label="Verdict">
                <Badge className={cn(verdictBg(result.verdict), "text-[9px] uppercase")}>{result.verdict}</Badge>
              </Stat>
              <Stat label="Risk score">
                <span>{result.riskScore}/100</span>
              </Stat>
              <Stat label="Cost estimate">
                <span>{result.costEstimate}</span>
              </Stat>
              <Stat label="Duration">
                <span>{result.durationMs}ms</span>
              </Stat>
              <Stat label="Steps">
                <span>{result.steps.length}</span>
              </Stat>
              <p className="text-[10px] text-muted-foreground mt-2">{result.summary}</p>
            </>
          ) : (
            <p className="text-[10px] text-muted-foreground">No run yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Bottom: logs/output */}
      {result && (
        <Card className="lg:col-span-12">
          <CardContent className="p-3">
            <h3 className="text-sm font-semibold mb-2">Logs & Output</h3>
            <pre className="text-[9px] font-mono bg-muted/30 p-2 rounded max-h-[200px] overflow-auto">
              {JSON.stringify(result.output, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[9px] uppercase text-muted-foreground/70">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[10px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="font-mono">{children}</span>
    </div>
  );
}

function stepColor(verdict: string) {
  if (verdict === "blocked") return "rgb(239 68 68)";
  if (verdict === "warning") return "rgb(234 179 8)";
  return "rgb(16 185 129)";
}

function verdictColor(verdict: string) {
  if (verdict === "blocked") return "text-red-400";
  if (verdict === "warning") return "text-yellow-400";
  return "text-emerald-400";
}

function verdictBg(verdict: string) {
  if (verdict === "blocked") return "bg-red-500/15 text-red-400 border border-red-500/30";
  if (verdict === "warning") return "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30";
  return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
}
