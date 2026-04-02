/**
 * PRM Methods — Method catalog, template registry, selection logic
 */

import type { PrmMethodType, PrmMethodCategory } from "./prm.types";

export interface MethodTemplateDefinition {
  methodType: PrmMethodType;
  name: string;
  description: string;
  category: PrmMethodCategory;
  defaultTemplate: Record<string, any>;
}

export const METHOD_CATALOG: MethodTemplateDefinition[] = [
  {
    methodType: "five_whys",
    name: "5 Whys",
    description: "Iterative interrogation technique to explore cause-and-effect relationships. Ask 'Why?' five times to reach the root cause.",
    category: "analytical",
    defaultTemplate: {
      whys: [
        { level: 1, question: "", answer: "" },
        { level: 2, question: "", answer: "" },
        { level: 3, question: "", answer: "" },
        { level: 4, question: "", answer: "" },
        { level: 5, question: "", answer: "" },
      ],
      rootCause: "",
    },
  },
  {
    methodType: "fishbone",
    name: "Fishbone / Ishikawa",
    description: "Cause-and-effect diagram organized by categories: People, Process, Equipment, Materials, Environment, Management.",
    category: "creative",
    defaultTemplate: {
      problem: "",
      categories: {
        people: [],
        process: [],
        equipment: [],
        materials: [],
        environment: [],
        management: [],
      },
      rootCauses: [],
    },
  },
  {
    methodType: "rca",
    name: "Root Cause Analysis (RCA)",
    description: "Systematic investigation to identify the fundamental reason for a problem occurrence.",
    category: "analytical",
    defaultTemplate: {
      problemDescription: "",
      dataGathering: "",
      causalFactors: [],
      rootCause: "",
      contributingFactors: [],
      evidenceLinks: [],
    },
  },
  {
    methodType: "a3",
    name: "A3 Report",
    description: "Toyota-style single-page structured report covering background, current state, goal, analysis, countermeasures, plan, and follow-up.",
    category: "process",
    defaultTemplate: {
      background: "",
      currentState: "",
      goal: "",
      analysis: "",
      countermeasures: [],
      implementationPlan: "",
      followUp: "",
    },
  },
  {
    methodType: "eight_d_lite",
    name: "8D Lite",
    description: "Simplified 8-discipline problem-solving method for team-based resolution.",
    category: "process",
    defaultTemplate: {
      d1_team: "",
      d2_problem: "",
      d3_containment: "",
      d4_rootCause: "",
      d5_corrective: "",
      d6_implementation: "",
      d7_prevention: "",
      d8_congratulate: "",
    },
  },
  {
    methodType: "decision_matrix",
    name: "Decision Matrix",
    description: "Weighted scoring grid for evaluating multiple options against defined criteria.",
    category: "optimization",
    defaultTemplate: {
      criteria: [],
      options: [],
      scores: {},
      recommendation: "",
    },
  },
  {
    methodType: "verification_checklist",
    name: "Verification Checklist",
    description: "Structured checklist to verify that corrective actions achieved the expected results.",
    category: "process",
    defaultTemplate: {
      checks: [],
      overallResult: "",
    },
  },
  {
    methodType: "prevention_plan",
    name: "Prevention Plan",
    description: "Document control changes, SOP updates, training needs, and monitoring rules to prevent recurrence.",
    category: "process",
    defaultTemplate: {
      controlChanges: [],
      sopUpdates: [],
      trainingNeeds: [],
      monitoringRules: [],
    },
  },
  {
    methodType: "hypothesis_testing",
    name: "Hypothesis Testing",
    description: "Scientific method: form hypothesis, design test, collect data, evaluate against expected outcome.",
    category: "scientific",
    defaultTemplate: {
      hypothesis: "",
      testDesign: "",
      expectedOutcome: "",
      actualOutcome: "",
      conclusion: "",
    },
  },
  {
    methodType: "fault_isolation",
    name: "Fault Isolation / Divide-and-Conquer",
    description: "Systematically narrow down the problem area by isolating subsystems and testing each independently.",
    category: "scientific",
    defaultTemplate: {
      systemDescription: "",
      subsystems: [],
      isolationSteps: [],
      faultLocation: "",
    },
  },
];

export function getMethodTemplate(methodType: PrmMethodType): MethodTemplateDefinition | undefined {
  return METHOD_CATALOG.find((m) => m.methodType === methodType);
}

export function getMethodsByCategory(category: PrmMethodCategory): MethodTemplateDefinition[] {
  return METHOD_CATALOG.filter((m) => m.category === category);
}
