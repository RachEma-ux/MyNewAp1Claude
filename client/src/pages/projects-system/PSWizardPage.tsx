import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

type Step = 1 | 2 | 3 | 4 | 5;

type ContextState = {
  businessUnit: string;
  region: string;
  strategicImportance: string;
  existingSituation: string;
};

type AnswerMap = Record<string, string>;

type Recommendation = {
  matrixVersionId: number;
  matrixVersion: string;
  selectedScope: string | null;
  selectedScopeCode: string | null;
  top3: Array<{ scopeId: number; scopeCode: string; scopeLabel: string; score: number }>;
  confidence: string;
  winnerMargin: number;
  explainability: {
    positiveContributors: string[];
    negativeContributors: string[];
  };
};

export default function PSWizardPage() {
  const [step, setStep] = useState<Step>(1);

  const [scenario, setScenario] = useState("");
  const [context, setContext] = useState<ContextState>({
    businessUnit: "",
    region: "",
    strategicImportance: "",
    existingSituation: "",
  });

  const [generatedName, setGeneratedName] = useState("");
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [overrideReason, setOverrideReason] = useState("");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [createError, setCreateError] = useState("");

  const [parsingDone, setParsingDone] = useState(false);
  const [normalizedDimensions, setNormalizedDimensions] = useState<Record<string, string>>({
    DOMAIN: "—",
    ORGANIZATIONAL_LEVEL: "—",
    CRITICALITY: "—",
    DELIVERY_STYLE: "—",
    VALUE_ORIENTATION: "—",
    LIFECYCLE_FOCUS: "—",
  });

  // Real API: fetch questions from active matrix
  const { data: questions = [] } = trpc.ps.getActiveQuestions.useQuery(undefined);

  // Real API: classify scenario mutation
  const classifyMutation = trpc.ps.classifyScenario.useMutation();

  // Real API: create PS project
  const utils = trpc.useUtils();
  const createPSProject = trpc.ps.createPSProject.useMutation();
  const [, navigate] = useLocation();

  const stepLabels = ["Scenario", "Context", "Questions", "Recommendation", "Create"];

  const canGoNext =
    (step === 1 && scenario.trim().length > 0) ||
    step === 2 ||
    step === 3 ||
    step === 4 ||
    step === 5;

  function nextStep() {
    if (!canGoNext) return;
    if (step === 3) {
      handleRunRecommendation();
      return;
    }
    if (step < 5) setStep((s) => (s + 1) as Step);
  }

  function prevStep() {
    if (step > 1) setStep((s) => (s - 1) as Step);
  }

  function deriveProjectName(text: string): string {
    // Take first sentence or first 60 chars of the scenario as project name
    const trimmed = text.trim();
    const firstSentence = trimmed.split(/[.!?\n]/)[0]?.trim() || trimmed;
    if (firstSentence.length <= 80) return firstSentence;
    // Truncate at last word boundary before 80 chars
    const cut = firstSentence.slice(0, 80);
    const lastSpace = cut.lastIndexOf(" ");
    return lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
  }

  function runAutomaticProcessing() {
    setParsingDone(true);
    setGeneratedName(deriveProjectName(scenario));
    setNormalizedDimensions({
      DOMAIN: "SOFTWARE_IT_ENGINEERING",
      ORGANIZATIONAL_LEVEL: "PROGRAM",
      CRITICALITY: "MEDIUM",
      DELIVERY_STYLE: "AGILE",
      VALUE_ORIENTATION: "SPEED_AGILITY",
      LIFECYCLE_FOCUS: "PRODUCT_LIFECYCLE",
    });
  }

  function setAnswer(code: string, value: string) {
    setAnswers((prev) => ({ ...prev, [code]: value }));
  }

  async function handleRunRecommendation() {
    try {
      const result = await classifyMutation.mutateAsync({
        scenario,
        context,
        answers,
      });
      setRecommendation(result);
      setStep(4);
    } catch (err) {
      console.error("Classification failed:", err);
    }
  }

  async function handleCreateAndList() {
    if (!recommendation) {
      setCreateError("No recommendation available — please go back to Step 3 and classify first.");
      return;
    }
    setCreateError("");
    try {
      const projectName = generatedName.trim() || recommendation.selectedScope || "Untitled Project";
      await createPSProject.mutateAsync({
        name: projectName,
        scope: recommendation.selectedScopeCode ?? recommendation.selectedScope ?? "CUSTOM",
        matrixVersion: recommendation.matrixVersion ?? "v1.0.0",
        scenario,
        context,
        answers,
        recommendation,
      });
      await utils.ps.systems.list.invalidate();
      navigate("/ps/list");
    } catch (err: any) {
      const msg = err?.message || "Failed to create PS project";
      setCreateError(msg);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-3xl font-bold text-indigo-400">Projects System Wizard</h1>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {stepLabels.map((label, index) => {
              const current = index + 1;
              const active = step === current;
              return (
                <div
                  key={label}
                  className={`rounded-full px-4 py-2 text-sm ${
                    active ? "bg-blue-600 text-white" : "bg-white/5 text-white/70"
                  }`}
                >
                  {current}. {label}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">Scenario</h2>
              <p className="text-white/70">2.1 Enter Scenario</p>

              <textarea
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                placeholder="Describe the project scenario..."
                rows={8}
                className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none"
              />

              <div className="text-sm text-white/50">{scenario.length}/5000 characters</div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">Context</h2>
              <p className="text-white/70">2.2 Set Context</p>

              <div className="grid gap-4 md:grid-cols-2">
                <input
                  value={context.businessUnit}
                  onChange={(e) => setContext({ ...context, businessUnit: e.target.value })}
                  placeholder="Business Unit"
                  className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none"
                />
                <input
                  value={context.region}
                  onChange={(e) => setContext({ ...context, region: e.target.value })}
                  placeholder="Region"
                  className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none"
                />
                <input
                  value={context.strategicImportance}
                  onChange={(e) => setContext({ ...context, strategicImportance: e.target.value })}
                  placeholder="Strategic Importance"
                  className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none"
                />
              </div>

              <textarea
                value={context.existingSituation}
                onChange={(e) => setContext({ ...context, existingSituation: e.target.value })}
                placeholder="Describe what is existing if any..."
                rows={6}
                className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none"
              />

              <div className="pt-2">
                <button
                  type="button"
                  onClick={runAutomaticProcessing}
                  className="rounded-xl bg-indigo-600 px-4 py-2 font-medium"
                >
                  Run automatic parsing
                </button>
              </div>

              {parsingDone && (
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
                  <div className="text-sm font-semibold text-indigo-300">
                    3.1 Automatic NLP parsing complete
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-white/80">
                    <li>software / IT domain</li>
                    <li>multi-team coordination</li>
                    <li>evolving requirements</li>
                    <li>need for faster delivery</li>
                    <li>service continuity sensitivity</li>
                  </ul>

                  <div className="mt-4 text-sm font-semibold text-indigo-300">
                    3.2 Auto-generated project name
                  </div>
                  <div className="mt-1 text-lg font-semibold">{generatedName}</div>

                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {Object.entries(normalizedDimensions).map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-black/40 px-3 py-2 text-sm">
                        <span className="text-white/50">{k}:</span> {v}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">Questions</h2>
              <p className="text-white/70">DB-driven runtime questions</p>

              <div className="space-y-3">
                {questions.map((q) => (
                  <div key={q.id} className="rounded-xl border border-white/10 bg-black/40 p-4">
                    <div className="mb-3 font-medium">{q.label}</div>
                    <div className="flex gap-2">
                      {["Yes", "No"].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setAnswer(q.code, value)}
                          className={`rounded-lg px-4 py-2 text-sm ${
                            answers[q.code] === value
                              ? "bg-blue-600 text-white"
                              : "bg-white/10 text-white/80"
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">Recommendation</h2>

              {recommendation ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                  <div className="text-sm text-white/50">Selected Scope</div>
                  <div className="mt-1 text-2xl font-bold text-indigo-300">
                    {recommendation.selectedScope}
                  </div>

                  <div className="mt-4 text-sm text-white/50">Top 3</div>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    {recommendation.top3.map((item) => (
                      <li key={item.scopeId}>
                        {item.scopeLabel} (score: {item.score})
                      </li>
                    ))}
                  </ol>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-sm text-white/50">Confidence</div>
                      <div className="font-semibold">{recommendation.confidence}</div>
                    </div>
                    <div>
                      <div className="text-sm text-white/50">Winner Margin</div>
                      <div className="font-semibold">+{recommendation.winnerMargin}</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm text-white/50">Positive contributors</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {recommendation.explainability.positiveContributors.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  {recommendation.explainability.negativeContributors.length > 0 && (
                    <div className="mt-4">
                      <div className="text-sm text-white/50">Negative / missing contributors</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {recommendation.explainability.negativeContributors.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-4">
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Override reason (optional)"
                      rows={4}
                      className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-white/50">
                  {classifyMutation.isPending ? "Running classification..." : "No recommendation yet"}
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">Create</h2>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4">
                <div>
                  <div className="text-sm text-white/50">Project Name</div>
                  <div className="font-semibold">{generatedName || "Auto-generated on create"}</div>
                </div>

                <div>
                  <div className="text-sm text-white/50">Scope</div>
                  <div className="font-semibold">{recommendation?.selectedScope ?? "—"}</div>
                </div>

                <div>
                  <div className="text-sm text-white/50">Matrix Version</div>
                  <div className="font-semibold">{recommendation?.matrixVersion ?? "—"}</div>
                </div>

                <div>
                  <div className="text-sm text-white/50">Demand Preview</div>
                  <ul className="mt-2 list-disc pl-5">
                    <li>Product Owner × 1</li>
                    <li>Scrum Master × 1</li>
                    <li>Backend Developer × 2</li>
                    <li>Frontend Developer × 2</li>
                    <li>QA × 1</li>
                  </ul>
                </div>

                {createError && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {createError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCreateAndList}
                  disabled={createPSProject.isPending}
                  className="rounded-xl bg-green-600 px-4 py-2 font-medium disabled:opacity-40"
                >
                  {createPSProject.isPending ? "Creating..." : "List PS Project"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-white/60">
            Step {step} of 5 — {stepLabels[step - 1]}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={prevStep}
              disabled={step === 1}
              className="rounded-xl border border-white/10 px-4 py-2 disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={nextStep}
              disabled={!canGoNext || step === 5 || (step === 3 && classifyMutation.isPending)}
              className="rounded-xl bg-blue-600 px-5 py-2 font-medium disabled:opacity-40"
            >
              {step === 3 ? "Classify" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
