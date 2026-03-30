/**
 * PS Text Analysis — Deterministic keyword-based extraction
 *
 * Scans scenario text + context to auto-suggest Yes/No answers
 * for each active matrix question. No LLM, no ML — pure keyword matching.
 */

// ── Keyword maps per question code ──────────────────────────────────────

interface KeywordRule {
  /** Keywords/phrases that suggest "Yes" */
  yesSignals: string[];
  /** Keywords/phrases that suggest "No" */
  noSignals: string[];
}

/**
 * Built-in keyword rules for the standard matrix questions.
 * Keys match the question codes in the active matrix.
 * New questions without a keyword rule will default to unanswered.
 */
const QUESTION_KEYWORDS: Record<string, KeywordRule> = {
  EVOLVING_REQUIREMENTS: {
    yesSignals: [
      "agile", "iterative", "evolving", "changing requirements", "uncertain",
      "flexible", "mvp", "prototype", "experiment", "adapt", "pivot",
      "discovery", "exploratory", "incremental", "emerging", "dynamic",
      "user feedback", "continuous improvement", "lean startup",
    ],
    noSignals: [
      "fixed scope", "fixed requirements", "waterfall", "predefined",
      "rigid", "locked", "frozen requirements", "specification complete",
      "signed off requirements", "stable scope",
    ],
  },

  SOFTWARE_CENTRIC: {
    yesSignals: [
      "software", "application", "app", "code", "api", "platform",
      "digital", "system", "microservice", "frontend", "backend",
      "database", "cloud", "saas", "web", "mobile app", "deployment",
      "devops", "ci/cd", "tech stack", "programming", "developer",
      "service-oriented", "integration", "automation tool",
    ],
    noSignals: [
      "construction", "building", "physical", "manufacturing",
      "hardware only", "civil engineering", "mechanical",
      "non-technical", "manual process", "paper-based",
    ],
  },

  MULTI_TEAM: {
    yesSignals: [
      "multiple teams", "cross-functional", "cross functional",
      "departments", "coordination", "organization-wide", "enterprise",
      "program", "portfolio", "multi-team", "distributed teams",
      "global teams", "stakeholders across", "inter-departmental",
      "multi-disciplinary", "several teams", "large-scale",
      "company-wide", "business units",
    ],
    noSignals: [
      "single team", "one team", "small team", "solo", "individual",
      "standalone", "isolated", "self-contained",
    ],
  },

  HIGH_COMPLIANCE: {
    yesSignals: [
      "compliance", "regulation", "regulatory", "audit", "security",
      "gdpr", "sox", "hipaa", "pci", "iso 27001", "certification",
      "governance", "legal requirement", "data protection", "privacy",
      "financial regulation", "medical device", "fda", "gxp",
      "safety-critical", "controlled environment", "validated",
      "aspice", "cmmi", "iec 62443",
    ],
    noSignals: [
      "no regulation", "no compliance", "internal only",
      "low risk", "informal", "no audit",
    ],
  },

  NEED_SPEED: {
    yesSignals: [
      "fast", "speed", "quick", "rapid", "urgent", "deadline",
      "time-to-market", "accelerate", "asap", "sprint", "velocity",
      "competitive pressure", "first mover", "launch soon",
      "time-sensitive", "tight timeline", "aggressive schedule",
      "quick turnaround", "race", "expedite",
    ],
    noSignals: [
      "no rush", "long-term", "multi-year", "phased rollout",
      "no deadline pressure", "deliberate", "careful planning",
      "thorough analysis first",
    ],
  },
};

// ── Extraction Engine ───────────────────────────────────────────────────

export interface ExtractedSignal {
  questionCode: string;
  suggestedAnswer: "Yes" | "No" | null;
  matchedKeywords: string[];
  confidence: "strong" | "weak" | "none";
}

export interface TextAnalysisResult {
  signals: ExtractedSignal[];
  suggestedAnswers: Record<string, string>;
  analyzedLength: number;
}

/**
 * Analyze scenario text + context fields and suggest answers for
 * the given set of question codes.
 */
export function analyzeScenarioText(
  scenario: string,
  context: { businessUnit?: string; region?: string; strategicImportance?: string; existingSituation?: string },
  questionCodes: string[],
): TextAnalysisResult {
  // Build combined text corpus (lowercase for matching)
  const parts = [
    scenario,
    context.businessUnit ?? "",
    context.region ?? "",
    context.strategicImportance ?? "",
    context.existingSituation ?? "",
  ];
  const corpus = parts.join(" ").toLowerCase();
  const analyzedLength = corpus.length;

  const signals: ExtractedSignal[] = [];
  const suggestedAnswers: Record<string, string> = {};

  for (const code of questionCodes) {
    const rules = QUESTION_KEYWORDS[code];
    if (!rules) {
      // No keyword rules for this question — skip
      signals.push({
        questionCode: code,
        suggestedAnswer: null,
        matchedKeywords: [],
        confidence: "none",
      });
      continue;
    }

    const rawYesMatches = findMatches(corpus, rules.yesSignals);
    const noMatches = findMatches(corpus, rules.noSignals);

    // Filter out yes-matches that are substrings of a no-match phrase
    // e.g. "regulation" (yes) should be suppressed when "no regulation" (no) also matched
    const yesMatches = rawYesMatches.filter(yk =>
      !noMatches.some(nk => nk.includes(yk)),
    );

    let suggestedAnswer: "Yes" | "No" | null = null;
    let confidence: "strong" | "weak" | "none" = "none";

    if (yesMatches.length > 0 && noMatches.length === 0) {
      suggestedAnswer = "Yes";
      confidence = yesMatches.length >= 2 ? "strong" : "weak";
    } else if (noMatches.length > 0 && yesMatches.length === 0) {
      suggestedAnswer = "No";
      confidence = noMatches.length >= 2 ? "strong" : "weak";
    } else if (yesMatches.length > noMatches.length) {
      suggestedAnswer = "Yes";
      confidence = "weak"; // conflicting signals
    } else if (noMatches.length > yesMatches.length) {
      suggestedAnswer = "No";
      confidence = "weak";
    }
    // else: tied or both empty → null

    signals.push({
      questionCode: code,
      suggestedAnswer,
      matchedKeywords: [...yesMatches.map(k => `+${k}`), ...noMatches.map(k => `-${k}`)],
      confidence,
    });

    if (suggestedAnswer) {
      suggestedAnswers[code] = suggestedAnswer;
    }
  }

  return { signals, suggestedAnswers, analyzedLength };
}

function findMatches(corpus: string, keywords: string[]): string[] {
  const found: string[] = [];
  for (const kw of keywords) {
    if (corpus.includes(kw.toLowerCase())) {
      found.push(kw);
    }
  }
  return found;
}
