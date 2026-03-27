/**
 * PS Wizard — 13-step flow
 *
 * Scenario → Context → NLP → Auto Name → Questions → Scoring →
 * Explainability → Recommendation → Accept → Create PS Project →
 * Validation → PM Central → Feedback
 *
 * All steps DB-driven, no hardcoded logic.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

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

const STEP_LABELS = [
  "Scenario",
  "Context",
  "NLP",
  "Auto Name",
  "Questions",
  "Scoring",
  "Explainability",
  "Recommendation",
  "Accept",
  "Create",
  "Validation",
  "PM Central",
  "Feedback",
] as const;

function deriveProjectName(text: string): string {
  const trimmed = text.trim();
  const firstSentence = trimmed.split(/[.!?\n]/)[0]?.trim() || trimmed;
  if (firstSentence.length <= 80) return firstSentence;
  const cut = firstSentence.slice(0, 80);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
}

export default function PSWizardPage() {
  const [step, setStep] = useState<Step>(1);

  // ── Input state ──────────────────────────────────────────────────────
  const [scenario, setScenario] = useState("");
  const [context, setContext] = useState<ContextState>({
    businessUnit: "",
    region: "",
    strategicImportance: "",
    existingSituation: "",
  });
  const [generatedName, setGeneratedName] = useState("");
  const [answers, setAnswers] = useState<AnswerMap>({});

  // ── Classification result ────────────────────────────────────────────
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  // ── Post-creation state ──────────────────────────────────────────────
  const [createdProjectId, setCreatedProjectId] = useState<number | null>(null);
  const [createError, setCreateError] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackOutcome, setFeedbackOutcome] = useState<string>("");

  // ── API hooks ────────────────────────────────────────────────────────

  // Full active matrix: questions + scopes + dimensions
  const { data: matrixData } = trpc.ps.matrix.getActiveQuestions.useQuery(undefined);

  // Classification mutation
  const classifyMutation = trpc.ps.classifyScenario.useMutation();

  // Project CRUD
  const utils = trpc.useUtils();
  const createProjectMut = trpc.ps.projects.create.useMutation();

  // Lifecycle transitions (existing server endpoints)
  const submitMut = trpc.ps.lifecycle.submit.useMutation();
  const sendToPMMut = trpc.ps.lifecycle.sendToPM.useMutation();

  // Feedback
  const feedbackMut = trpc.ps.feedback.create.useMutation();

  // Fetch created project for post-creation steps
  const { data: createdProject, refetch: refetchProject } = trpc.ps.projects.get.useQuery(
    { id: createdProjectId! },
    { enabled: createdProjectId !== null },
  );

  const [, navigate] = useLocation();

  // Derived: active questions from matrix
  const questions = matrixData?.available ? matrixData.questions : [];
  const dimensions = matrixData?.available ? matrixData.dimensions : [];

  // ── Step navigation ──────────────────────────────────────────────────

  const canGoNext =
    (step === 1 && scenario.trim().length > 0) ||
    step === 2 ||
    step === 3 ||
    (step === 4 && generatedName.trim().length > 0) ||
    step === 5 ||
    (step >= 6 && step <= 8 && recommendation !== null) ||
    (step === 9 && recommendation !== null) ||
    (step === 10 && createdProjectId !== null) ||
    (step === 11 && createdProject !== null) ||
    step === 12 ||
    false; // step 13 = final

  function nextStep() {
    if (!canGoNext) return;

    // Step 3 (NLP) → Step 4 (Auto Name): auto-derive name
    if (step === 3) {
      if (!generatedName) {
        setGeneratedName(deriveProjectName(scenario));
      }
      setStep(4);
      return;
    }

    // Step 5 (Questions) → Step 6 (Scoring): run classification
    if (step === 5) {
      handleRunClassification();
      return;
    }

    // Step 9 (Accept) → Step 10 (Create): create the project
    if (step === 9) {
      handleCreateProject();
      return;
    }

    if (step < 13) setStep((s) => (s + 1) as Step);
  }

  function prevStep() {
    // Don't go back past creation
    if (step <= 1 || step > 10) return;
    setStep((s) => (s - 1) as Step);
  }

  // ── Classification ───────────────────────────────────────────────────

  async function handleRunClassification() {
    setCreateError("");
    try {
      const result = await classifyMutation.mutateAsync({
        scenario,
        context,
        answers,
      });
      setRecommendation(result);
      setStep(6);
    } catch (err: any) {
      const msg = err?.message || "Classification failed";
      setCreateError(msg);
    }
  }

  // ── Project creation ─────────────────────────────────────────────────

  async function handleCreateProject() {
    if (!recommendation) {
      setCreateError("No recommendation available — go back and classify first.");
      return;
    }
    setCreateError("");
    try {
      const projectName = generatedName.trim() || recommendation.selectedScope || "Untitled Project";
      const project = await createProjectMut.mutateAsync({
        name: projectName,
        scenario,
        context,
        answers,
        selectedScopeCode: recommendation.selectedScopeCode ?? "CUSTOM",
        selectedScopeLabel: recommendation.selectedScope ?? "Custom",
        topScopes: recommendation.top3.map((t) => ({
          scopeCode: t.scopeCode,
          scopeLabel: t.scopeLabel,
          score: t.score,
        })),
        confidence: recommendation.confidence,
        explainability: recommendation.explainability,
        matrixVersionId: recommendation.matrixVersionId,
        matrixVersion: recommendation.matrixVersion,
      });
      setCreatedProjectId(project.id);
      await utils.ps.projects.list.invalidate();
      setStep(10);
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create PS project");
    }
  }

  // ── Validation ───────────────────────────────────────────────────────

  async function handleSubmitForValidation() {
    if (!createdProjectId) return;
    try {
      await submitMut.mutateAsync({ projectId: createdProjectId });
      await refetchProject();
    } catch (err: any) {
      setCreateError(err?.message || "Validation transition failed");
    }
  }

  // ── PM Handoff ───────────────────────────────────────────────────────

  async function handleSendToPM() {
    if (!createdProjectId) return;
    try {
      await sendToPMMut.mutateAsync({ projectId: createdProjectId });
      await refetchProject();
    } catch (err: any) {
      setCreateError(err?.message || "PM handoff failed");
    }
  }

  // ── Feedback ─────────────────────────────────────────────────────────

  async function handleSubmitFeedback() {
    if (!createdProjectId || !feedbackOutcome) return;
    try {
      await feedbackMut.mutateAsync({
        psProjectId: createdProjectId,
        outcome: feedbackOutcome as "success" | "partial" | "failed" | "cancelled",
        notes: feedbackNotes || undefined,
      });
      navigate("/ps/list");
    } catch (err: any) {
      setCreateError(err?.message || "Feedback submission failed");
    }
  }

  // ── Rendering ────────────────────────────────────────────────────────

  const isPostCreation = step >= 10;
  const isClassifying = classifyMutation.isPending;
  const isCreating = createProjectMut.isPending;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* ── Header + Step Progress ─────────────────────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-3xl font-bold text-indigo-400">Projects System Wizard</h1>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {STEP_LABELS.map((label, index) => {
              const num = index + 1;
              const active = step === num;
              const completed = step > num;
              return (
                <div
                  key={label}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    active
                      ? "bg-blue-600 text-white"
                      : completed
                        ? "bg-blue-600/20 text-blue-300"
                        : "bg-white/5 text-white/40"
                  }`}
                >
                  {num}. {label}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Step Content ────────────────────────────────────────────── */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">

          {/* Step 1: Scenario */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">1. Scenario</h2>
              <p className="text-white/70">Describe the project scenario in detail</p>
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

          {/* Step 2: Context */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">2. Context</h2>
              <p className="text-white/70">Set organizational context</p>
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
            </div>
          )}

          {/* Step 3: NLP — DB-driven dimension extraction */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">3. NLP Analysis</h2>
              <p className="text-white/70">
                Automatic dimension extraction from scenario and context
              </p>

              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 space-y-4">
                <div className="text-sm font-semibold text-indigo-300">
                  Scenario text analysed ({scenario.length} chars)
                </div>
                <div className="rounded-lg bg-black/40 px-3 py-2 text-sm text-white/70 max-h-32 overflow-y-auto">
                  {scenario.slice(0, 200)}{scenario.length > 200 ? "..." : ""}
                </div>

                {dimensions.length > 0 ? (
                  <>
                    <div className="text-sm font-semibold text-indigo-300">
                      Classification Dimensions (from active matrix)
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {dimensions.map((dim) => (
                        <div key={dim.id} className="rounded-lg bg-black/40 px-3 py-2 text-sm">
                          <span className="text-white/50">{dim.dimensionLabel}:</span>{" "}
                          <span className="text-white/80">
                            {dim.values.length > 0
                              ? dim.values.map((v) => v.valueLabel).join(", ")
                              : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-white/50">
                    No dimensions loaded — ensure an active matrix version exists.
                  </div>
                )}

                {context.businessUnit || context.region || context.strategicImportance ? (
                  <>
                    <div className="text-sm font-semibold text-indigo-300">
                      Extracted Context Signals
                    </div>
                    <ul className="space-y-1 text-sm text-white/80">
                      {context.businessUnit && <li>Business Unit: {context.businessUnit}</li>}
                      {context.region && <li>Region: {context.region}</li>}
                      {context.strategicImportance && (
                        <li>Strategic Importance: {context.strategicImportance}</li>
                      )}
                    </ul>
                  </>
                ) : null}
              </div>
            </div>
          )}

          {/* Step 4: Auto Name */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">4. Auto Name</h2>
              <p className="text-white/70">
                Auto-generated project name from scenario. Edit if needed.
              </p>
              <input
                value={generatedName}
                onChange={(e) => setGeneratedName(e.target.value)}
                placeholder="Project name"
                className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-lg font-semibold text-white outline-none"
              />
              <div className="text-sm text-white/50">
                Derived from first sentence of scenario text
              </div>
            </div>
          )}

          {/* Step 5: Questions */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">5. Questions</h2>
              <p className="text-white/70">DB-driven classification questions from active matrix</p>

              {questions.length === 0 ? (
                <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
                  No questions loaded. Ensure an active matrix version exists in PS Control Panel.
                </div>
              ) : (
                <div className="space-y-3">
                  {questions.map((q) => (
                    <div key={q.id} className="rounded-xl border border-white/10 bg-black/40 p-4">
                      <div className="mb-3 font-medium">{q.label}</div>
                      <div className="flex gap-2">
                        {["Yes", "No"].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setAnswers((prev) => ({ ...prev, [q.code]: value }))}
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
              )}

              {isClassifying && (
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-400">
                  Running classification...
                </div>
              )}

              {createError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {createError}
                </div>
              )}
            </div>
          )}

          {/* Step 6: Scoring */}
          {step === 6 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">6. Scoring</h2>
              <p className="text-white/70">Matrix evaluation scores per scope</p>

              {recommendation ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4">
                  <div className="text-sm text-white/50">Ranked Scopes (Top 3)</div>
                  <ol className="list-decimal space-y-2 pl-5">
                    {recommendation.top3.map((item, idx) => (
                      <li key={item.scopeId}>
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{item.scopeLabel}</span>
                          <span className="text-sm text-white/50">({item.scopeCode})</span>
                          <div className="ml-auto flex items-center gap-2">
                            <div className="h-2 rounded-full bg-white/10 w-32">
                              <div
                                className={`h-2 rounded-full ${idx === 0 ? "bg-indigo-500" : "bg-white/30"}`}
                                style={{
                                  width: `${recommendation.top3[0].score > 0
                                    ? (item.score / recommendation.top3[0].score) * 100
                                    : 0}%`,
                                }}
                              />
                            </div>
                            <span className="text-sm font-mono w-8 text-right">{item.score}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <div className="grid gap-4 md:grid-cols-2 pt-2">
                    <div>
                      <div className="text-sm text-white/50">Winner Margin</div>
                      <div className="font-semibold text-lg">+{recommendation.winnerMargin}</div>
                    </div>
                    <div>
                      <div className="text-sm text-white/50">Confidence</div>
                      <div className="font-semibold text-lg">{recommendation.confidence}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-white/50">
                  {isClassifying ? "Running classification..." : "No scores available"}
                </div>
              )}
            </div>
          )}

          {/* Step 7: Explainability */}
          {step === 7 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">7. Explainability</h2>
              <p className="text-white/70">Why this scope was selected</p>

              {recommendation ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4">
                  <div>
                    <div className="text-sm font-semibold text-green-400">Positive Contributors</div>
                    {recommendation.explainability.positiveContributors.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-white/80">
                        {recommendation.explainability.positiveContributors.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-1 text-sm text-white/50">None detected</div>
                    )}
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-red-400">Negative / Missing Contributors</div>
                    {recommendation.explainability.negativeContributors.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-white/80">
                        {recommendation.explainability.negativeContributors.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-1 text-sm text-white/50">No negative signals</div>
                    )}
                  </div>

                  <div className="pt-2 text-sm text-white/50">
                    Winner margin: +{recommendation.winnerMargin} | Confidence: {recommendation.confidence}
                  </div>
                </div>
              ) : (
                <div className="text-white/50">No explainability data available</div>
              )}
            </div>
          )}

          {/* Step 8: Recommendation */}
          {step === 8 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">8. Recommendation</h2>
              <p className="text-white/70">Final scope recommendation</p>

              {recommendation ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4">
                  <div className="text-sm text-white/50">Recommended Scope</div>
                  <div className="text-2xl font-bold text-indigo-300">
                    {recommendation.selectedScope}
                  </div>
                  <div className="text-sm text-white/50">
                    Code: {recommendation.selectedScopeCode} | Matrix: {recommendation.matrixVersion}
                  </div>

                  <div>
                    <div className="text-sm text-white/50 mt-4">Override (optional)</div>
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="If you disagree with the recommendation, explain why..."
                      rows={3}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-white/50">No recommendation available</div>
              )}
            </div>
          )}

          {/* Step 9: Accept */}
          {step === 9 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">9. Accept</h2>
              <p className="text-white/70">Review and confirm all inputs before project creation</p>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
                <div>
                  <div className="text-sm text-white/50">Project Name</div>
                  <div className="font-semibold">{generatedName || "Auto-generated"}</div>
                </div>
                <div>
                  <div className="text-sm text-white/50">Scenario</div>
                  <div className="text-sm text-white/70 max-h-20 overflow-y-auto">{scenario.slice(0, 200)}{scenario.length > 200 ? "..." : ""}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-sm text-white/50">Business Unit</div>
                    <div className="text-sm">{context.businessUnit || "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-white/50">Region</div>
                    <div className="text-sm">{context.region || "—"}</div>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-white/50">Selected Scope</div>
                  <div className="font-semibold text-indigo-300">{recommendation?.selectedScope ?? "—"}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="text-sm text-white/50">Confidence</div>
                    <div className="text-sm">{recommendation?.confidence ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-white/50">Matrix Version</div>
                    <div className="text-sm">{recommendation?.matrixVersion ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-white/50">Questions Answered</div>
                    <div className="text-sm">{Object.keys(answers).length}</div>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-white/50">Decision Trace</div>
                  <div className="mt-1 rounded-lg bg-black/40 px-3 py-2 text-xs text-white/60 font-mono">
                    scope={recommendation?.selectedScopeCode} | confidence={recommendation?.confidence} | matrix_v={recommendation?.matrixVersion} | top3=[{recommendation?.top3.map(t => t.scopeCode).join(", ")}]
                  </div>
                </div>
                {overrideReason && (
                  <div>
                    <div className="text-sm text-white/50">Override Reason</div>
                    <div className="text-sm text-yellow-300">{overrideReason}</div>
                  </div>
                )}
              </div>

              {createError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {createError}
                </div>
              )}
            </div>
          )}

          {/* Step 10: Create PS Project */}
          {step === 10 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">10. Create PS Project</h2>

              {createdProjectId ? (
                <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 space-y-3">
                  <div className="text-lg font-semibold text-green-400">
                    Project created successfully
                  </div>
                  <div className="text-sm text-white/70">
                    Project ID: {createdProjectId} | Status: DRAFT
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
                  {isCreating ? (
                    <div className="text-white/50">Creating project...</div>
                  ) : (
                    <div className="text-white/50">Waiting for creation...</div>
                  )}
                  {createError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                      {createError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 11: Validation */}
          {step === 11 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">11. Validation</h2>
              <p className="text-white/70">Submit project for validation review</p>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4">
                <div>
                  <div className="text-sm text-white/50">Current Status</div>
                  <div className="mt-1">
                    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${
                      createdProject?.status === "DRAFT"
                        ? "bg-yellow-500/10 border border-yellow-500/30 text-yellow-400"
                        : "bg-blue-500/10 border border-blue-500/30 text-blue-400"
                    }`}>
                      {createdProject?.status ?? "DRAFT"}
                    </span>
                  </div>
                </div>

                {createdProject?.validationNote && (
                  <div>
                    <div className="text-sm text-white/50">Validation Note</div>
                    <div className="text-sm text-white/80">{createdProject.validationNote}</div>
                  </div>
                )}

                {createdProject?.status === "DRAFT" && (
                  <button
                    type="button"
                    onClick={handleSubmitForValidation}
                    disabled={submitMut.isPending}
                    className="rounded-xl bg-blue-600 px-4 py-2 font-medium disabled:opacity-40"
                  >
                    {submitMut.isPending ? "Submitting..." : "Submit for Validation"}
                  </button>
                )}

                {createError && (
                  <div className="text-sm text-red-400">{createError}</div>
                )}
              </div>
            </div>
          )}

          {/* Step 12: PM Central */}
          {step === 12 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">12. PM Central</h2>
              <p className="text-white/70">Handoff to PM Central for execution</p>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4">
                <div>
                  <div className="text-sm text-white/50">Project Status</div>
                  <div className="font-semibold">
                    {(createdProject?.status ?? "—").toUpperCase()}
                  </div>
                </div>

                {createdProject?.pmProjectId && (
                  <div>
                    <div className="text-sm text-white/50">PM Project ID</div>
                    <div className="font-semibold text-indigo-300">#{createdProject.pmProjectId}</div>
                  </div>
                )}

                {createdProject?.status === "DRAFT" && (
                  <div className="text-sm text-white/50">
                    Project must be validated before PM handoff.
                  </div>
                )}

                {!createdProject?.pmProjectId && createdProject?.status !== "DRAFT" && (
                  <button
                    type="button"
                    onClick={handleSendToPM}
                    disabled={sendToPMMut.isPending}
                    className="rounded-xl bg-indigo-600 px-4 py-2 font-medium disabled:opacity-40"
                  >
                    {sendToPMMut.isPending ? "Sending..." : "Send to PM Central"}
                  </button>
                )}

                {createError && (
                  <div className="text-sm text-red-400">{createError}</div>
                )}
              </div>
            </div>
          )}

          {/* Step 13: Feedback */}
          {step === 13 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">13. Feedback</h2>
              <p className="text-white/70">Record execution feedback for this project</p>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4">
                <div>
                  <div className="text-sm text-white/50">Outcome</div>
                  <div className="flex gap-2 mt-1">
                    {["success", "partial", "failed", "cancelled"].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setFeedbackOutcome(opt)}
                        className={`rounded-lg px-4 py-2 text-sm capitalize ${
                          feedbackOutcome === opt
                            ? "bg-blue-600 text-white"
                            : "bg-white/10 text-white/80"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-white/50">Notes (optional)</div>
                  <textarea
                    value={feedbackNotes}
                    onChange={(e) => setFeedbackNotes(e.target.value)}
                    placeholder="Any feedback about the project delivery..."
                    rows={4}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleSubmitFeedback}
                    disabled={!feedbackOutcome || feedbackMut.isPending}
                    className="rounded-xl bg-green-600 px-4 py-2 font-medium disabled:opacity-40"
                  >
                    {feedbackMut.isPending ? "Submitting..." : "Submit Feedback & Finish"}
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/ps/list")}
                    className="rounded-xl border border-white/10 px-4 py-2"
                  >
                    Skip & Go to List
                  </button>
                </div>

                {createError && (
                  <div className="text-sm text-red-400">{createError}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer Navigation ──────────────────────────────────────── */}
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-white/60">
            Step {step} of 13 — {STEP_LABELS[step - 1]}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={prevStep}
              disabled={step === 1 || isPostCreation}
              className="rounded-xl border border-white/10 px-4 py-2 disabled:opacity-40"
            >
              Back
            </button>
            {step < 13 && (
              <button
                type="button"
                onClick={nextStep}
                disabled={
                  !canGoNext ||
                  isClassifying ||
                  isCreating ||
                  (step === 9 && isCreating)
                }
                className="rounded-xl bg-blue-600 px-5 py-2 font-medium disabled:opacity-40"
              >
                {step === 5
                  ? "Classify"
                  : step === 9
                    ? "Accept & Create"
                    : "Next"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
