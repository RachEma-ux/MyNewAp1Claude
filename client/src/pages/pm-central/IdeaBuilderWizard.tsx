/**
 * IdeaBuilderWizard — AI-Powered Idea-to-PMI Project Builder
 *
 * A real AI agent registered in the AI Types Catalog, classified across 9 taxonomy axes,
 * powered by an LLM via the provider system.
 *
 * Flow:
 *   Step 1: Describe idea + constraints
 *   Step 2: AI Agent analyzes, asks questions, chat conversation
 *   Step 3: Generate artifacts (LLM or template fallback)
 *   Step 4: Review drafts (commit/reject)
 *   Step 5: Summary & finalize
 */

import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { trpc } from "@/lib/trpc";
import AgentBadge from "@/components/pm/AgentBadge";
import {
  Lightbulb, Play, FileSearch, CheckCircle2,
  ChevronRight, ChevronDown, ChevronLeft, Check, X, Bot,
  Loader2, ArrowRight, Shield, AlertTriangle, MessageSquare,
  Brain, Cpu, Zap, Send, Info,
} from "lucide-react";

const STEPS = [
  { id: 1, label: "Describe", icon: <Lightbulb className="h-4 w-4" /> },
  { id: 2, label: "AI Analysis", icon: <Brain className="h-4 w-4" /> },
  { id: 3, label: "Generate", icon: <Play className="h-4 w-4" /> },
  { id: 4, label: "Review", icon: <FileSearch className="h-4 w-4" /> },
  { id: 5, label: "Finalize", icon: <CheckCircle2 className="h-4 w-4" /> },
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function IdeaBuilderWizard() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);

  // Input state
  const [ideaText, setIdeaText] = useState("");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [riskTier, setRiskTier] = useState("medium");
  const [methodology, setMethodology] = useState("predictive");

  // Agent analysis state
  const [analysis, setAnalysis] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Run state
  const [runId, setRunId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState("");
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [engine, setEngine] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // tRPC mutations & queries
  const agentInfoQuery = trpc.modules.pmt.shell.ideaBuilder.agentInfo.useQuery();
  const analyzeMut = trpc.modules.pmt.shell.ideaBuilder.analyze.useMutation();
  const chatMut = trpc.modules.pmt.shell.ideaBuilder.chat.useMutation();
  const launchMut = trpc.modules.pmt.shell.ideaBuilder.launch.useMutation();
  const commitMut = trpc.modules.pmt.shell.ideaBuilder.commit.useMutation();
  const commitAllMut = trpc.modules.pmt.shell.ideaBuilder.commitAll.useMutation();
  const rejectMut = trpc.modules.pmt.shell.ideaBuilder.reject.useMutation();

  const statusQuery = trpc.modules.pmt.shell.ideaBuilder.status.useQuery(
    { runId: runId! },
    { enabled: !!runId && (step === 3 || step === 4), refetchInterval: step === 3 ? 2000 : 5000 },
  );

  const draftsQuery = trpc.modules.pmt.shell.ideaBuilder.drafts.useQuery(
    { runId: runId! },
    { enabled: !!runId && step >= 4, refetchInterval: 5000 },
  );

  const agentInfo = agentInfoQuery.data;
  const run = statusQuery.data;
  const drafts = draftsQuery.data || [];

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Auto-advance from generation to review
  useEffect(() => {
    if (step === 3 && run && (run.status === "completed" || run.status === "failed")) {
      setStep(4);
    }
  }, [step, run]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    setLaunchError(null);
    try {
      const result = await analyzeMut.mutateAsync({
        ideaText,
        ...(budget ? { budgetEnvelope: parseFloat(budget) } : {}),
        ...(deadline ? { deadline } : {}),
        riskTier: riskTier as any,
        methodology: methodology as any,
      });
      setAnalysis(result);

      // Add agent's analysis as a chat message
      const analysisMsg = result.agentThinking
        ? result.agentThinking
        : `I've analyzed your project idea. Here are my findings:\n\n**Project Type:** ${result.projectType}\n**Complexity:** ${result.estimatedComplexity}\n**Recommended Methodology:** ${result.methodology}`;

      const questions = result.clarifyingQuestions?.length
        ? `\n\nI have a few questions to improve the artifacts:\n${result.clarifyingQuestions.map((q: any) => `- ${q.question}`).join("\n")}`
        : "";

      setChatMessages([{
        role: "assistant",
        content: analysisMsg + questions + "\n\nYou can answer my questions, ask me anything, or click **Generate Artifacts** when ready.",
      }]);

      setStep(2);
    } catch (err: any) {
      setLaunchError(err.message || "Analysis failed");
    }
  }

  async function handleChatSend() {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput("");

    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: userMsg }];
    setChatMessages(newMessages);

    // Track answers to questions
    if (analysis?.clarifyingQuestions?.length) {
      const unansweredQ = analysis.clarifyingQuestions.find((q: any) => !answers[q.id]);
      if (unansweredQ) {
        setAnswers(prev => ({ ...prev, [unansweredQ.id]: userMsg }));
      }
    }

    try {
      const result = await chatMut.mutateAsync({
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
      });
      setChatMessages([...newMessages, { role: "assistant", content: result.response }]);
    } catch (err: any) {
      setChatMessages([...newMessages, {
        role: "assistant",
        content: `I encountered an error: ${err.message}. You can still proceed with generating artifacts.`,
      }]);
    }
  }

  async function handleLaunch() {
    setLaunchError(null);
    try {
      const result = await launchMut.mutateAsync({
        ideaText,
        ...(budget ? { budgetEnvelope: parseFloat(budget) } : {}),
        ...(deadline ? { deadline } : {}),
        riskTier: riskTier as any,
        methodology: methodology as any,
        answers,
      });
      setRunId(result.runId);
      setProjectId(result.projectId);
      setProjectName(result.projectName);
      setEngine(result.engine);
      setStep(3);
    } catch (err: any) {
      setLaunchError(err.message || "Launch failed. Please try again.");
    }
  }

  async function handleCommit(draftId: number) {
    await commitMut.mutateAsync({ draftId });
    draftsQuery.refetch();
  }

  async function handleReject(draftId: number) {
    await rejectMut.mutateAsync({ draftId });
    draftsQuery.refetch();
  }

  async function handleCommitAll() {
    if (!runId) return;
    await commitAllMut.mutateAsync({ runId });
    draftsQuery.refetch();
    setStep(5);
  }

  const canAnalyze = ideaText.length >= 20;
  const dagNodes = (run?.planDag || []) as Array<{ id: string; agent_alias: string; status: string }>;
  const pendingDrafts = drafts.filter((d: any) => d.commitStatus === "pending");
  const committedDrafts = drafts.filter((d: any) => d.commitStatus === "committed");

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4 overflow-hidden">
        {/* Agent Header */}
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">PM Idea-to-PMI Builder</h1>
              {agentInfo && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  agentInfo.llmAvailable
                    ? "bg-green-500/15 text-green-500"
                    : "bg-yellow-500/15 text-yellow-500"
                }`}>
                  {agentInfo.llmAvailable ? (
                    <><Zap className="h-3 w-3 inline mr-1" />AI Powered</>
                  ) : (
                    <><Cpu className="h-3 w-3 inline mr-1" />Template Mode</>
                  )}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {agentInfo?.llmAvailable
                ? `Real AI agent using ${agentInfo.providerInfo?.name || "LLM"} — thinks, asks questions, generates intelligent artifacts`
                : "Configure an LLM provider for AI-powered analysis. Currently using template generation."}
            </p>
          </div>
        </div>

        {/* Agent Catalog Info (collapsed by default) */}
        {agentInfo && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Info className="h-3 w-3" />
                <span>Agent Catalog Info</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mt-2 border-muted">
                <CardContent className="py-3 px-4 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div><span className="text-muted-foreground">Catalog ID:</span> <span className="font-mono">{agentInfo.catalogId}</span></div>
                    <div><span className="text-muted-foreground">Version:</span> {agentInfo.version}</div>
                    <div><span className="text-muted-foreground">Entry Type:</span> agent</div>
                    <div><span className="text-muted-foreground">Category:</span> specialist</div>
                    {agentInfo.providerInfo && (
                      <div><span className="text-muted-foreground">Provider:</span> {agentInfo.providerInfo.name} ({agentInfo.providerInfo.type})</div>
                    )}
                    {agentInfo.catalogEntryId && (
                      <div><span className="text-muted-foreground">DB Entry ID:</span> #{agentInfo.catalogEntryId}</div>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Taxonomy (9 axes):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(agentInfo.taxonomyClassification).map(([axis, value]) => (
                        <span key={axis} className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">
                          {axis.replace(/_/g, " ")}: {Array.isArray(value) ? (value as string[]).join(", ") : String(value)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className="text-muted-foreground mr-1">Capabilities:</span>
                    {agentInfo.capabilities.map((cap: string) => (
                      <span key={cap} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">{cap}</span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Step Indicator */}
        <div className="flex flex-wrap items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div
                className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${
                  s.id === step
                    ? "bg-primary text-primary-foreground"
                    : s.id < step
                    ? "bg-green-500/15 text-green-500"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s.id < step ? <Check className="h-3 w-3" /> : s.icon}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5" />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <Card className="overflow-hidden">
          <CardContent className="py-4 px-4 sm:py-6 sm:px-6">

            {/* ── Step 1: Describe Idea + Constraints ── */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" />
                    Describe Your Project Idea
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    The AI agent will analyze your idea, ask clarifying questions, then generate all PMI artifacts.
                  </p>
                </div>

                <Textarea
                  value={ideaText}
                  onChange={(e) => setIdeaText(e.target.value)}
                  placeholder="Describe your project idea in detail. Include the problem to solve, key deliverables, and expected outcomes. The more detail you provide, the better the AI analysis will be..."
                  className="min-h-[160px] text-sm"
                  maxLength={5000}
                />
                <div className="text-xs text-muted-foreground flex justify-between">
                  <span>{ideaText.length} / 5,000</span>
                  <span>{ideaText.length < 20 ? `${20 - ideaText.length} more characters needed` : "Ready"}</span>
                </div>

                {/* Inline constraints */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Budget (USD)</label>
                    <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="500000" min="0" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Deadline</label>
                    <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Risk Tier</label>
                    <Select value={riskTier} onValueChange={setRiskTier}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Methodology</label>
                    <Select value={methodology} onValueChange={setMethodology}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="predictive">Predictive (PMI)</SelectItem>
                        <SelectItem value="agile">Agile</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Safety banner */}
                <Card className="border-yellow-500/30 bg-yellow-500/5">
                  <CardContent className="py-2 px-3 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-yellow-500 shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      All outputs are drafts requiring your explicit commit. The agent cannot approve gates or modify baselines.
                    </span>
                  </CardContent>
                </Card>

                {launchError && (
                  <Card className="border-red-500/30 bg-red-500/5">
                    <CardContent className="py-2 px-3 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      <span className="text-xs text-red-400 break-words">{launchError}</span>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ── Step 2: AI Agent Analysis & Chat ── */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Brain className="h-5 w-5" />
                      AI Agent Analysis
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {analysis?.llmPowered
                        ? "The agent has analyzed your idea. Chat to refine, then generate."
                        : "Template mode — no LLM available. You can proceed to generate directly."}
                    </p>
                  </div>
                  {analysis?.llmPowered && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Confidence:</span>
                      <div className="flex items-center gap-1">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${(analysis.confidence?.overall || 0) * 100}%` }}
                          />
                        </div>
                        <span className="font-medium">{Math.round((analysis.confidence?.overall || 0) * 100)}%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Analysis cards */}
                {analysis?.llmPowered && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <MiniCard label="Type" value={analysis.projectType} />
                    <MiniCard label="Complexity" value={analysis.estimatedComplexity} />
                    <MiniCard label="Methodology" value={analysis.methodology} />
                    <MiniCard label="Ready" value={analysis.readyToGenerate ? "Yes" : "Needs info"} />
                  </div>
                )}

                {/* Key insights */}
                {analysis?.keyInsights?.length > 0 && (
                  <div className="text-xs space-y-1">
                    <span className="font-medium text-muted-foreground">Key Insights:</span>
                    <div className="flex flex-wrap gap-1">
                      {analysis.keyInsights.slice(0, 5).map((insight: string, i: number) => (
                        <span key={i} className="bg-muted px-2 py-0.5 rounded">{insight}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chat conversation */}
                <div className="border rounded-lg bg-background">
                  <div className="max-h-[300px] overflow-y-auto p-3 space-y-3">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Bot className="h-3.5 w-3.5 text-primary" />
                          </div>
                        )}
                        <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}>
                          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                        </div>
                      </div>
                    ))}
                    {chatMut.isPending && (
                      <div className="flex gap-2">
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        </div>
                        <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                          Thinking...
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Chat input */}
                  <div className="border-t p-2 flex gap-2">
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChatSend()}
                      placeholder="Ask the agent a question or provide more details..."
                      className="text-sm h-8"
                      disabled={chatMut.isPending}
                    />
                    <Button size="sm" className="h-8 px-3" onClick={handleChatSend} disabled={chatMut.isPending || !chatInput.trim()}>
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3: Generate (DAG Progress) ── */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Play className="h-5 w-5" />
                    Generating PMI Artifacts
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {engine === "llm"
                      ? "The AI agent is generating 11 PMI artifacts using LLM reasoning..."
                      : "Generating 11 PMI artifacts using template engine..."}
                  </p>
                </div>

                {run && (
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <AgentBadge variant={run.status as any} />
                    {projectName && <span className="text-sm text-muted-foreground">Project: {projectName}</span>}
                    {engine && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        engine === "llm" ? "bg-green-500/15 text-green-500" : "bg-muted text-muted-foreground"
                      }`}>
                        {engine === "llm" ? "LLM" : "Template"}
                      </span>
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  {dagNodes.map((node, idx) => (
                    <div key={node.id} className="flex items-center gap-3 py-1.5">
                      <div className="flex flex-col items-center w-6">
                        <div className={`w-3 h-3 rounded-full border-2 ${
                          node.status === "completed" ? "bg-green-500 border-green-500"
                          : node.status === "running" ? "bg-blue-500 border-blue-500 animate-pulse"
                          : node.status === "failed" ? "bg-red-500 border-red-500"
                          : node.status === "skipped" ? "bg-muted border-muted-foreground/30"
                          : "bg-background border-muted-foreground/30"
                        }`} />
                        {idx < dagNodes.length - 1 && (
                          <div className={`w-0.5 h-5 ${
                            node.status === "completed" ? "bg-green-500/50" : "bg-muted"
                          }`} />
                        )}
                      </div>
                      <div className="flex items-center justify-between flex-1 min-w-0">
                        <span className="text-sm truncate">{node.id.replace(/_/g, " ")}</span>
                        <AgentBadge variant={node.status as any} />
                      </div>
                    </div>
                  ))}
                </div>

                {(!run || run.status === "pending" || run.status === "running") && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                    <span className="text-sm text-muted-foreground">Processing...</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 4: Review Drafts ── */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <FileSearch className="h-5 w-5 shrink-0" />
                      Review Draft Artifacts
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {drafts.length} artifacts generated{engine === "llm" ? " via AI" : " via templates"}. Review each and commit or reject.
                    </p>
                  </div>
                  {pendingDrafts.length > 0 && (
                    <Button onClick={handleCommitAll} disabled={commitAllMut.isPending} className="gap-1.5 shrink-0">
                      <Check className="h-4 w-4" /> Commit All ({pendingDrafts.length})
                    </Button>
                  )}
                </div>

                {drafts.length === 0 && run?.status === "failed" && (
                  <Card className="border-red-500/30">
                    <CardContent className="py-4 text-center">
                      <AlertTriangle className="h-6 w-6 text-red-500 mx-auto mb-2" />
                      <p className="text-sm text-red-500">Run failed. Some artifacts may not have been generated.</p>
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-2">
                  {drafts.map((draft: any) => (
                    <DraftReviewCard
                      key={draft.id}
                      draft={draft}
                      onCommit={() => handleCommit(draft.id)}
                      onReject={() => handleReject(draft.id)}
                      isCommitting={commitMut.isPending}
                      isRejecting={rejectMut.isPending}
                    />
                  ))}
                </div>

                {pendingDrafts.length === 0 && drafts.length > 0 && (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-3">All drafts have been reviewed.</p>
                    <Button onClick={() => setStep(5)} className="gap-1.5">
                      Continue to Summary <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 5: Finalize ── */}
            {step === 5 && (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <h2 className="text-xl font-bold">Project Created</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {projectName && <>Project "{projectName}" — {committedDrafts.length} committed artifact{committedDrafts.length !== 1 ? "s" : ""}.</>}
                  </p>
                  {engine === "llm" && (
                    <p className="text-xs text-green-500 mt-1">Generated by AI agent via LLM</p>
                  )}
                </div>

                <Card>
                  <CardContent className="py-4 px-5">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-muted-foreground">Total Artifacts:</span> <span className="ml-2 font-medium">{drafts.length}</span></div>
                      <div><span className="text-muted-foreground">Committed:</span> <span className="ml-2 font-medium text-green-500">{committedDrafts.length}</span></div>
                      <div><span className="text-muted-foreground">Rejected:</span> <span className="ml-2 font-medium">{drafts.filter((d: any) => d.commitStatus === "rejected").length}</span></div>
                      <div><span className="text-muted-foreground">Engine:</span> <span className="ml-2 font-medium">{engine === "llm" ? "AI (LLM)" : "Template"}</span></div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-center gap-3 pt-4">
                  {projectId && (
                    <Button onClick={() => navigate(`/pm-central/p/${projectId}/overview`)} className="gap-1.5">
                      Open Project <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep(1); setIdeaText(""); setBudget(""); setDeadline("");
                      setRiskTier("medium"); setMethodology("predictive");
                      setRunId(null); setProjectId(null); setProjectName("");
                      setAnalysis(null); setChatMessages([]); setAnswers({});
                      setEngine(null); setLaunchError(null);
                    }}
                  >
                    Build Another
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        {step === 1 && (
          <div className="flex justify-end">
            <Button onClick={handleAnalyze} disabled={!canAnalyze || analyzeMut.isPending} className="gap-1.5">
              {analyzeMut.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</>
              ) : (
                <><Brain className="h-4 w-4" /> Analyze with AI</>
              )}
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-1.5">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={handleLaunch} disabled={launchMut.isPending} className="gap-1.5">
              {launchMut.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Launching...</>
              ) : (
                <><Play className="h-4 w-4" /> Generate Artifacts</>
              )}
            </Button>
          </div>
        )}

        {launchError && step === 2 && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="py-2 px-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <span className="text-xs text-red-400 break-words">{launchError}</span>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}

// ── Mini Card ────────────────────────────────────────────────────────────────

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted rounded-lg px-3 py-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium capitalize mt-0.5">{value}</div>
    </div>
  );
}

// ── Draft Review Card ────────────────────────────────────────────────────────

function DraftReviewCard({
  draft,
  onCommit,
  onReject,
  isCommitting,
  isRejecting,
}: {
  draft: any;
  onCommit: () => void;
  onReject: () => void;
  isCommitting: boolean;
  isRejecting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const content = draft.content || {};
  const label = (draft.artifactType as string).replace(/_/g, " ");

  return (
    <Card className="overflow-hidden">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-3">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors min-w-0">
              {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <span className="capitalize truncate">{label}</span>
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2 ml-auto">
            <AgentBadge
              variant={
                draft.commitStatus === "committed" ? "committed"
                : draft.commitStatus === "rejected" ? "rejected"
                : "pending"
              }
            />
            {draft.commitStatus === "pending" && (
              <>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onReject} disabled={isRejecting}>
                  <X className="h-3 w-3" /> Reject
                </Button>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={onCommit} disabled={isCommitting}>
                  <Check className="h-3 w-3" /> Commit
                </Button>
              </>
            )}
          </div>
        </div>
        <CollapsibleContent>
          <div className="px-3 sm:px-4 pb-3 border-t pt-3">
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap break-words">
              {JSON.stringify(content, null, 2)}
            </pre>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
