/**
 * PSM Methods — Canonical 100-Method Catalog
 *
 * Structured data for import into PSMDB relational tables.
 * This is NOT the runtime source of truth — PSMDB is.
 * This file is used by seed.ts to populate the database.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface CategoryDef {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
}

export interface MethodDef {
  slug: string;
  name: string;
  categorySlug: string;
  description: string;
  summary: string;
  complexity: "low" | "medium" | "high";
  timeframe: "short" | "medium" | "long";
  participantsMin: number;
  participantsMax: number;
  bestFor: string;
  tools: string;
  example: string;
  aliases: string[];
  tags: string[];
  relatedSlugs: string[];
  workflow: { title: string; description: string; steps: { title: string; description: string; durationMinutes: number; deliverable: string }[] };
  /** Selector fit: dimension → ideal score range [min, max] and weight */
  fitRules: { dimension: string; weight: number; min: number; max: number }[];
}

export interface ProblemTypeDef {
  slug: string;
  name: string;
  description: string;
}

// ── Categories ──────────────────────────────────────────────────────────────

export const PSM_CATEGORIES: CategoryDef[] = [
  { slug: "root-cause-analysis", name: "Root Cause Analysis", description: "Methods for identifying the underlying causes of problems and failures.", sortOrder: 1 },
  { slug: "creative-problem-solving", name: "Creative Problem Solving", description: "Techniques for generating novel ideas and innovative solutions.", sortOrder: 2 },
  { slug: "decision-making", name: "Decision Making", description: "Structured approaches for evaluating alternatives and making choices.", sortOrder: 3 },
  { slug: "process-improvement", name: "Process Improvement", description: "Methods for optimizing workflows, reducing waste, and increasing efficiency.", sortOrder: 4 },
  { slug: "strategic-planning", name: "Strategic Planning", description: "Frameworks for long-term planning, competitive positioning, and organizational direction.", sortOrder: 5 },
  { slug: "design-innovation", name: "Design & Innovation", description: "User-centered approaches for designing products, services, and experiences.", sortOrder: 6 },
  { slug: "data-analytics", name: "Data & Analytics", description: "Quantitative methods for analyzing data, testing hypotheses, and deriving insights.", sortOrder: 7 },
  { slug: "systems-thinking", name: "Systems Thinking", description: "Holistic approaches for understanding complex, interconnected systems.", sortOrder: 8 },
  { slug: "agile-iterative", name: "Agile & Iterative", description: "Rapid-cycle methods for continuous improvement and adaptive problem solving.", sortOrder: 9 },
  { slug: "collaboration-facilitation", name: "Collaboration & Facilitation", description: "Techniques for effective group work, consensus building, and collective intelligence.", sortOrder: 10 },
];

// ── Problem Types ───────────────────────────────────────────────────────────

export const PSM_PROBLEM_TYPES: ProblemTypeDef[] = [
  { slug: "operational-issue", name: "Operational Issue", description: "Day-to-day operational problems affecting efficiency or quality." },
  { slug: "recurring-defect", name: "Recurring Defect", description: "Problems that keep coming back despite previous fixes." },
  { slug: "strategic-decision", name: "Strategic Decision", description: "High-level decisions with long-term organizational impact." },
  { slug: "innovation-challenge", name: "Innovation Challenge", description: "Need for new ideas, products, or approaches." },
  { slug: "team-conflict", name: "Team/Stakeholder Conflict", description: "Disagreements or misalignment among team members or stakeholders." },
  { slug: "crisis-response", name: "Crisis Response", description: "Urgent situations requiring rapid analysis and action." },
  { slug: "process-bottleneck", name: "Process Bottleneck", description: "Workflow constraints limiting throughput or performance." },
  { slug: "quality-failure", name: "Quality Failure", description: "Product or service quality falling below standards." },
  { slug: "resource-optimization", name: "Resource Optimization", description: "Need to do more with less or allocate resources better." },
  { slug: "complex-system", name: "Complex System Problem", description: "Problems in interconnected systems with emergent behavior." },
];

// ── 100 Methods ─────────────────────────────────────────────────────────────

export const PSM_METHOD_CATALOG: MethodDef[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // Category 1: Root Cause Analysis (10 methods)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    slug: "five-whys",
    name: "5 Whys",
    categorySlug: "root-cause-analysis",
    description: "Iterative interrogation technique asking 'Why?' five times to drill down to the root cause of a problem.",
    summary: "The 5 Whys is one of the simplest yet most effective root cause analysis techniques. Starting with a problem statement, you repeatedly ask 'Why?' to peel away layers of symptoms and reach the fundamental cause. Each answer forms the basis for the next question. Despite its simplicity, it requires discipline to avoid jumping to conclusions and to follow the causal chain honestly.",
    complexity: "low",
    timeframe: "short",
    participantsMin: 1,
    participantsMax: 8,
    bestFor: "Simple to moderately complex problems with a clear starting point. Ideal for quick analysis of production issues, service failures, or process breakdowns where the cause is not immediately obvious.",
    tools: "Whiteboard, sticky notes, spreadsheet, or any 5 Whys template. Digital tools: Miro, Lucidchart, or a simple document.",
    example: "A manufacturing line stops: Why? The fuse blew. Why? The bearing overheated. Why? Insufficient lubrication. Why? The pump wasn't delivering enough oil. Why? The pump intake was clogged with debris. Root cause: No intake filter on the pump.",
    aliases: ["Five Whys", "5-Why Analysis", "Why-Why Analysis"],
    tags: ["root-cause", "quick", "simple", "toyota", "lean"],
    relatedSlugs: ["fishbone-diagram", "fault-tree-analysis", "a3-thinking"],
    workflow: {
      title: "5 Whys Analysis",
      description: "Systematic drill-down from symptom to root cause.",
      steps: [
        { title: "Define the Problem", description: "Write a clear, specific problem statement. Be factual — what happened, when, where.", durationMinutes: 10, deliverable: "Problem statement" },
        { title: "Ask Why #1", description: "Ask why the problem occurred. Write the answer based on facts, not assumptions.", durationMinutes: 5, deliverable: "First-level cause" },
        { title: "Ask Why #2", description: "Take the answer from Why #1 and ask why that happened.", durationMinutes: 5, deliverable: "Second-level cause" },
        { title: "Ask Why #3", description: "Continue the chain. Verify each answer with data if possible.", durationMinutes: 5, deliverable: "Third-level cause" },
        { title: "Ask Why #4–5", description: "Continue until you reach a cause that, if addressed, would prevent recurrence. May need fewer or more than 5 iterations.", durationMinutes: 10, deliverable: "Root cause identified" },
        { title: "Define Countermeasure", description: "Propose a corrective action that addresses the root cause, not just symptoms.", durationMinutes: 15, deliverable: "Action plan" },
      ],
    },
    fitRules: [
      { dimension: "diagnosis_need", weight: 2.0, min: 3, max: 5 },
      { dimension: "complexity", weight: 1.0, min: 1, max: 3 },
      { dimension: "urgency", weight: 1.5, min: 3, max: 5 },
      { dimension: "data_availability", weight: 1.2, min: 2, max: 5 },
    ],
  },

  {
    slug: "fishbone-diagram",
    name: "Fishbone Diagram",
    categorySlug: "root-cause-analysis",
    description: "Cause-and-effect diagram organizing potential causes into categories (People, Process, Equipment, Materials, Environment, Management).",
    summary: "Also known as Ishikawa or cause-and-effect diagram, this visual tool maps all possible causes of a problem organized by category. The fish-shaped diagram places the problem at the head and branches represent major cause categories. Teams brainstorm potential causes within each category, creating a comprehensive map of contributing factors.",
    complexity: "low",
    timeframe: "short",
    participantsMin: 3,
    participantsMax: 12,
    bestFor: "Complex problems with multiple potential causes across different domains. Excellent for team-based root cause sessions where diverse perspectives are valuable.",
    tools: "Whiteboard, large paper, sticky notes. Digital: Miro, Lucidchart, MindMeister, Fishbone diagram templates.",
    example: "A hospital investigates high patient wait times. Categories reveal: People (understaffing during shift change), Process (redundant paperwork), Equipment (slow lab equipment), Materials (missing forms), Environment (poor signage), Management (no triage protocol).",
    aliases: ["Ishikawa Diagram", "Cause-and-Effect Diagram", "Herringbone Diagram", "6M Diagram"],
    tags: ["root-cause", "visual", "team", "brainstorming", "quality"],
    relatedSlugs: ["five-whys", "pareto-analysis", "brainstorming"],
    workflow: {
      title: "Fishbone Analysis",
      description: "Visual cause categorization workshop.",
      steps: [
        { title: "State the Problem", description: "Write the problem at the 'head' of the fish. Be specific and measurable.", durationMinutes: 10, deliverable: "Problem statement on diagram" },
        { title: "Identify Major Categories", description: "Draw the main 'bones' — typically 6M: Man, Machine, Method, Material, Measurement, Mother Nature. Adapt to context.", durationMinutes: 5, deliverable: "Category framework" },
        { title: "Brainstorm Causes", description: "For each category, brainstorm potential causes. Add sub-branches for sub-causes. No filtering yet.", durationMinutes: 30, deliverable: "Populated fishbone diagram" },
        { title: "Analyze and Prioritize", description: "Circle or mark the most likely root causes. Use voting or data to prioritize.", durationMinutes: 15, deliverable: "Top 3-5 probable root causes" },
        { title: "Verify with Data", description: "Gather evidence to confirm or rule out top candidates.", durationMinutes: 20, deliverable: "Verified root cause(s)" },
      ],
    },
    fitRules: [
      { dimension: "diagnosis_need", weight: 2.0, min: 3, max: 5 },
      { dimension: "collaboration_intensity", weight: 1.5, min: 3, max: 5 },
      { dimension: "complexity", weight: 1.3, min: 2, max: 5 },
    ],
  },

  {
    slug: "fault-tree-analysis",
    name: "Fault Tree Analysis",
    categorySlug: "root-cause-analysis",
    description: "Top-down, deductive analysis using Boolean logic to map how combinations of failures lead to an undesired event.",
    summary: "FTA starts with an undesired top event and works backward through AND/OR logic gates to identify all possible combinations of component failures or conditions that could cause it. Originally developed for nuclear and aerospace safety, it provides a rigorous, quantitative approach to understanding failure modes.",
    complexity: "high",
    timeframe: "long",
    participantsMin: 2,
    participantsMax: 6,
    bestFor: "Safety-critical systems, complex engineering failures, risk assessment where understanding all failure paths is essential.",
    tools: "Fault tree software (Isograph, ReliaSoft), or diagramming tools. Requires probability data for quantitative analysis.",
    example: "Analyzing why an aircraft hydraulic system could fail: OR gate connects three paths — pump failure (AND: motor failure + backup pump failure), line rupture, valve malfunction — each decomposed further.",
    aliases: ["FTA", "Fault Tree", "Failure Tree Analysis"],
    tags: ["root-cause", "safety", "engineering", "quantitative", "risk"],
    relatedSlugs: ["fishbone-diagram", "barrier-analysis", "monte-carlo-simulation"],
    workflow: {
      title: "Fault Tree Analysis",
      description: "Systematic top-down failure decomposition.",
      steps: [
        { title: "Define Top Event", description: "Identify the undesired event to analyze. Be precise about what constitutes the failure.", durationMinutes: 15, deliverable: "Top event definition" },
        { title: "Identify Immediate Causes", description: "Determine what events or conditions directly cause the top event. Connect with AND/OR gates.", durationMinutes: 30, deliverable: "First-level fault tree" },
        { title: "Decompose Further", description: "For each intermediate event, identify its causes. Continue until reaching basic events (component failures, human errors).", durationMinutes: 60, deliverable: "Complete fault tree" },
        { title: "Identify Minimal Cut Sets", description: "Find the smallest combinations of basic events that cause the top event.", durationMinutes: 30, deliverable: "Minimal cut sets list" },
        { title: "Quantitative Analysis", description: "If probability data is available, calculate top event probability. Identify dominant failure paths.", durationMinutes: 45, deliverable: "Probability assessment" },
        { title: "Recommend Mitigations", description: "For dominant cut sets, propose design changes, redundancy, or procedural safeguards.", durationMinutes: 30, deliverable: "Mitigation recommendations" },
      ],
    },
    fitRules: [
      { dimension: "diagnosis_need", weight: 2.0, min: 4, max: 5 },
      { dimension: "complexity", weight: 1.8, min: 4, max: 5 },
      { dimension: "risk_level", weight: 1.5, min: 4, max: 5 },
      { dimension: "data_availability", weight: 1.3, min: 3, max: 5 },
    ],
  },

  {
    slug: "pareto-analysis",
    name: "Pareto Analysis",
    categorySlug: "root-cause-analysis",
    description: "Applies the 80/20 principle to identify the vital few causes that produce the majority of effects.",
    summary: "Based on the Pareto Principle (80% of problems come from 20% of causes), this method uses frequency data to create a bar chart ranked by impact. A cumulative line shows the percentage contribution of each cause. This focuses improvement efforts on the causes that will yield the greatest benefit.",
    complexity: "low",
    timeframe: "short",
    participantsMin: 1,
    participantsMax: 5,
    bestFor: "Prioritizing among many potential causes or issues. Best when you have frequency or impact data and need to decide where to focus limited resources.",
    tools: "Spreadsheet (Excel, Google Sheets), quality tools software. Simple to create with any charting tool.",
    example: "A call center analyzes 1,000 complaints: billing errors (42%), long wait times (25%), rude staff (15%), wrong information (10%), other (8%). Focus on billing errors and wait times to address 67% of complaints.",
    aliases: ["Pareto Chart", "80/20 Analysis", "Vital Few Analysis"],
    tags: ["root-cause", "prioritization", "data-driven", "quality", "quick"],
    relatedSlugs: ["fishbone-diagram", "statistical-process-control", "six-sigma-dmaic"],
    workflow: {
      title: "Pareto Analysis",
      description: "Data-driven prioritization of causes.",
      steps: [
        { title: "Collect Data", description: "Gather frequency or impact data for each cause category. Use existing records, logs, or observations.", durationMinutes: 30, deliverable: "Raw data table" },
        { title: "Sort and Rank", description: "Sort categories from highest to lowest frequency/impact. Calculate percentages.", durationMinutes: 10, deliverable: "Ranked data table" },
        { title: "Create Pareto Chart", description: "Build bar chart (descending) with cumulative percentage line. Mark the 80% threshold.", durationMinutes: 15, deliverable: "Pareto chart" },
        { title: "Identify Vital Few", description: "The categories to the left of the 80% line are your vital few. These are your priority targets.", durationMinutes: 5, deliverable: "Priority cause list" },
        { title: "Plan Actions", description: "Develop improvement actions targeting the vital few causes.", durationMinutes: 20, deliverable: "Action plan" },
      ],
    },
    fitRules: [
      { dimension: "data_availability", weight: 2.0, min: 3, max: 5 },
      { dimension: "diagnosis_need", weight: 1.5, min: 2, max: 5 },
      { dimension: "optimization_need", weight: 1.3, min: 3, max: 5 },
    ],
  },

  {
    slug: "kepner-tregoe-problem",
    name: "Kepner-Tregoe Problem Analysis",
    categorySlug: "root-cause-analysis",
    description: "Structured method that uses IS/IS NOT comparisons and change analysis to isolate the true cause of a deviation.",
    summary: "KT Problem Analysis separates the problem into four dimensions (What, Where, When, Extent) and for each asks what IS affected vs. what IS NOT affected but could be. By identifying distinctions and changes, you logically narrow down the most probable cause. It is particularly powerful for problems that represent a deviation from expected performance.",
    complexity: "medium",
    timeframe: "medium",
    participantsMin: 2,
    participantsMax: 8,
    bestFor: "Deviations from expected performance where something changed. Excellent for IT incidents, equipment failures, quality deviations.",
    tools: "KT worksheet template, whiteboard with IS/IS NOT matrix.",
    example: "A server that was working yesterday now crashes at 2pm daily. IS: production server A. IS NOT: servers B, C. Changed: new monitoring agent deployed yesterday at 1:45pm. Test: disable agent → problem stops. Cause confirmed.",
    aliases: ["KT Problem Analysis", "IS/IS NOT Analysis", "Kepner-Tregoe"],
    tags: ["root-cause", "structured", "deviation", "change-analysis", "IT"],
    relatedSlugs: ["change-analysis", "five-whys", "barrier-analysis"],
    workflow: {
      title: "Kepner-Tregoe Problem Analysis",
      description: "Structured deviation analysis using IS/IS NOT.",
      steps: [
        { title: "State the Deviation", description: "Describe what should be happening vs. what is actually happening. Be precise.", durationMinutes: 10, deliverable: "Deviation statement" },
        { title: "Specify IS / IS NOT", description: "For What, Where, When, Extent: document what IS affected and what IS NOT but could be.", durationMinutes: 25, deliverable: "IS/IS NOT specification" },
        { title: "Identify Distinctions", description: "What is distinctive about the IS compared to the IS NOT? What makes the affected items unique?", durationMinutes: 15, deliverable: "Distinctions list" },
        { title: "Identify Changes", description: "What changed in, around, or related to the distinctions? When did each change occur?", durationMinutes: 15, deliverable: "Change inventory" },
        { title: "Generate Possible Causes", description: "For each change × distinction combination, hypothesize how it could produce the deviation.", durationMinutes: 15, deliverable: "Hypothesis list" },
        { title: "Test Most Probable Cause", description: "The best hypothesis explains all IS and IS NOT data. Verify with test or data.", durationMinutes: 20, deliverable: "Verified root cause" },
      ],
    },
    fitRules: [
      { dimension: "diagnosis_need", weight: 2.0, min: 4, max: 5 },
      { dimension: "data_availability", weight: 1.5, min: 3, max: 5 },
      { dimension: "process_maturity", weight: 1.2, min: 3, max: 5 },
    ],
  },

  {
    slug: "current-reality-tree",
    name: "Current Reality Tree",
    categorySlug: "root-cause-analysis",
    description: "Theory of Constraints tool that maps cause-effect relationships to find the core conflict or root constraint driving multiple undesirable effects.",
    summary: "The CRT is a logic-based tool from Goldratt's Theory of Constraints. It starts with a list of undesirable effects (UDEs) and connects them through cause-effect logic until reaching a small number of root causes. By reading the tree bottom-up ('If X then Y'), you can validate the logic chain and identify where an intervention would resolve multiple problems simultaneously.",
    complexity: "high",
    timeframe: "long",
    participantsMin: 2,
    participantsMax: 8,
    bestFor: "Situations with multiple interconnected problems where treating symptoms hasn't worked. Ideal for organizational issues with systemic root causes.",
    tools: "Large whiteboard or wall space, sticky notes per UDE. Software: Flying Logic, XMind.",
    example: "A company has: late deliveries, high overtime, customer complaints, and employee turnover. CRT reveals all trace back to a policy of accepting all rush orders without capacity check.",
    aliases: ["CRT", "Reality Tree"],
    tags: ["root-cause", "systems", "TOC", "logic-tree", "complex"],
    relatedSlugs: ["theory-of-constraints", "causal-loop-diagram", "five-whys"],
    workflow: {
      title: "Current Reality Tree",
      description: "Map cause-effect chains to find the core problem.",
      steps: [
        { title: "List Undesirable Effects", description: "Gather 5-10 significant UDEs that the team experiences. Write each on a separate card.", durationMinutes: 20, deliverable: "UDE list" },
        { title: "Connect Effects", description: "For each UDE, ask 'Why does this exist?' Link UDEs through cause-effect arrows using 'If...then...' logic.", durationMinutes: 45, deliverable: "Connected logic tree" },
        { title: "Validate Logic", description: "Read each connection aloud as 'If X, then Y.' Check with the Categories of Legitimate Reservation.", durationMinutes: 20, deliverable: "Validated tree" },
        { title: "Identify Root Causes", description: "The entities at the bottom of the tree with no further causes are root causes. Usually 1-3 drive most UDEs.", durationMinutes: 10, deliverable: "Root cause(s) identified" },
        { title: "Develop Injection", description: "Design an intervention ('injection') at the root cause that would break the chain.", durationMinutes: 25, deliverable: "Proposed solution" },
      ],
    },
    fitRules: [
      { dimension: "complexity", weight: 2.0, min: 4, max: 5 },
      { dimension: "diagnosis_need", weight: 1.8, min: 4, max: 5 },
      { dimension: "stakeholder_count", weight: 1.2, min: 3, max: 5 },
    ],
  },

  {
    slug: "causal-factor-analysis",
    name: "Causal Factor Analysis",
    categorySlug: "root-cause-analysis",
    description: "Identifies causal factors by constructing a timeline of events and conditions that led to an incident.",
    summary: "CFA builds a detailed timeline (events and causal factors chart) showing the sequence of events, conditions, and barriers that failed. Each event is analyzed for what caused it and what barriers should have prevented it. Commonly used in incident investigation for safety-critical industries.",
    complexity: "medium",
    timeframe: "medium",
    participantsMin: 2,
    participantsMax: 10,
    bestFor: "Incident investigation, safety events, process failures with a clear sequence of events.",
    tools: "Timeline template, investigation report forms, evidence collection tools.",
    example: "Investigating a chemical spill: timeline reveals operator received conflicting instructions, alarm was silenced 20 minutes prior, and backup valve had been disabled for maintenance without lockout/tagout.",
    aliases: ["Events and Causal Factors Analysis", "ECFA", "Timeline Analysis"],
    tags: ["root-cause", "incident", "safety", "timeline", "investigation"],
    relatedSlugs: ["barrier-analysis", "fault-tree-analysis", "change-analysis"],
    workflow: {
      title: "Causal Factor Analysis",
      description: "Build timeline and identify causal factors.",
      steps: [
        { title: "Gather Evidence", description: "Collect all available data: logs, interviews, physical evidence, records.", durationMinutes: 60, deliverable: "Evidence package" },
        { title: "Build Event Timeline", description: "Place events in chronological order on a timeline. Include conditions present.", durationMinutes: 30, deliverable: "Event timeline" },
        { title: "Identify Causal Factors", description: "For each event, identify what caused it and what barriers failed or were absent.", durationMinutes: 30, deliverable: "Causal factors chart" },
        { title: "Determine Root Causes", description: "Trace causal factors back to organizational or systemic root causes.", durationMinutes: 20, deliverable: "Root cause determination" },
        { title: "Recommend Corrective Actions", description: "Propose fixes addressing root causes, not just the immediate causal factors.", durationMinutes: 20, deliverable: "Corrective action plan" },
      ],
    },
    fitRules: [
      { dimension: "diagnosis_need", weight: 2.0, min: 4, max: 5 },
      { dimension: "data_availability", weight: 1.5, min: 3, max: 5 },
      { dimension: "risk_level", weight: 1.3, min: 3, max: 5 },
    ],
  },

  {
    slug: "barrier-analysis",
    name: "Barrier Analysis",
    categorySlug: "root-cause-analysis",
    description: "Identifies what barriers (controls, safeguards) should have prevented an undesired event and why they failed.",
    summary: "Barrier Analysis examines each defensive layer that should have prevented a hazard from reaching a target. For each barrier, it asks: Was it in place? Did it function? Why did it fail? This method is powerful for safety and quality management because it directly identifies gaps in the defense-in-depth strategy.",
    complexity: "medium",
    timeframe: "medium",
    participantsMin: 2,
    participantsMax: 8,
    bestFor: "Safety incidents, quality escapes, security breaches — any event where multiple safeguards should have prevented the outcome.",
    tools: "Barrier analysis worksheet, Swiss Cheese model diagrams.",
    example: "Patient medication error: prescribing barrier (doctor prescribed wrong dose), pharmacy barrier (pharmacist didn't catch it — understaffed), administration barrier (nurse noticed but didn't question doctor). Two barriers failed, one caught it too late.",
    aliases: ["Defense in Depth Analysis", "Swiss Cheese Analysis", "Barrier Failure Analysis"],
    tags: ["root-cause", "safety", "barriers", "defense", "quality"],
    relatedSlugs: ["fault-tree-analysis", "causal-factor-analysis", "poka-yoke"],
    workflow: {
      title: "Barrier Analysis",
      description: "Evaluate defensive barriers and their failure modes.",
      steps: [
        { title: "Define Hazard and Target", description: "Identify the hazard (energy/threat) and the target (what was harmed/affected).", durationMinutes: 10, deliverable: "Hazard-target definition" },
        { title: "Map Existing Barriers", description: "List all barriers (physical, administrative, procedural) between hazard and target.", durationMinutes: 20, deliverable: "Barrier inventory" },
        { title: "Assess Each Barrier", description: "For each barrier: Was it in place? Did it perform? If it failed, why?", durationMinutes: 30, deliverable: "Barrier assessment table" },
        { title: "Identify Missing Barriers", description: "What additional barriers should have existed but didn't?", durationMinutes: 15, deliverable: "Gap analysis" },
        { title: "Strengthen Defenses", description: "Recommend repairs to failed barriers and addition of missing ones.", durationMinutes: 15, deliverable: "Barrier improvement plan" },
      ],
    },
    fitRules: [
      { dimension: "risk_level", weight: 2.0, min: 3, max: 5 },
      { dimension: "diagnosis_need", weight: 1.5, min: 3, max: 5 },
      { dimension: "process_maturity", weight: 1.3, min: 2, max: 5 },
    ],
  },

  {
    slug: "change-analysis",
    name: "Change Analysis",
    categorySlug: "root-cause-analysis",
    description: "Compares the problem state against a known good state to identify what changed and caused the deviation.",
    summary: "Change Analysis systematically compares two states — when things worked vs. when they didn't — across all relevant dimensions. By documenting every difference, teams can identify which change(s) are the most likely cause. Simple but effective for problems triggered by environmental, configuration, or process changes.",
    complexity: "low",
    timeframe: "short",
    participantsMin: 1,
    participantsMax: 6,
    bestFor: "Problems that started at a specific point in time, especially after a deployment, configuration change, or environmental shift.",
    tools: "Comparison worksheet, version control diff tools, configuration management databases.",
    example: "Website performance degraded last Tuesday. Change analysis reveals: new CDN configuration deployed Monday, no other changes. Rolling back CDN config confirms it as the cause.",
    aliases: ["Change Impact Analysis", "Before/After Analysis"],
    tags: ["root-cause", "quick", "deviation", "comparison", "IT"],
    relatedSlugs: ["kepner-tregoe-problem", "five-whys", "causal-factor-analysis"],
    workflow: {
      title: "Change Analysis",
      description: "Compare good state vs. problem state.",
      steps: [
        { title: "Define Both States", description: "Describe the 'good' (working) state and the 'problem' state clearly.", durationMinutes: 10, deliverable: "State descriptions" },
        { title: "List All Changes", description: "Document every change between the two states across all dimensions: people, process, technology, environment.", durationMinutes: 20, deliverable: "Change inventory" },
        { title: "Evaluate Each Change", description: "For each change, assess: Could this have caused the problem? Rate likelihood.", durationMinutes: 15, deliverable: "Ranked change list" },
        { title: "Test Top Candidates", description: "Reverse or isolate the most likely changes to confirm causation.", durationMinutes: 20, deliverable: "Confirmed cause" },
      ],
    },
    fitRules: [
      { dimension: "urgency", weight: 1.8, min: 3, max: 5 },
      { dimension: "diagnosis_need", weight: 1.5, min: 3, max: 5 },
      { dimension: "data_availability", weight: 1.3, min: 2, max: 5 },
    ],
  },

  {
    slug: "bow-tie-analysis",
    name: "Bow-Tie Analysis",
    categorySlug: "root-cause-analysis",
    description: "Visual risk analysis combining fault tree (threats) and event tree (consequences) around a central hazardous event.",
    summary: "Bow-Tie diagrams provide a complete picture of a risk scenario. The left side shows threats and preventive barriers (like a fault tree), the center is the hazardous event, and the right side shows consequences and mitigating barriers (like an event tree). This gives a clear, communicable view of the entire risk landscape.",
    complexity: "medium",
    timeframe: "medium",
    participantsMin: 3,
    participantsMax: 10,
    bestFor: "Risk management, safety case development, communicating risk controls to stakeholders. Used extensively in oil & gas, aviation, and healthcare.",
    tools: "BowTieXP, CGE Risk Management, or general diagramming tools.",
    example: "For a gas leak hazard: Left side shows threats (corrosion, impact damage, seal failure) with preventive barriers (inspection, protection, maintenance). Right side shows consequences (fire, toxicity, environmental damage) with mitigating barriers (detection, shutdown, emergency response).",
    aliases: ["Bowtie Diagram", "Bow Tie Risk Assessment"],
    tags: ["root-cause", "risk", "visual", "safety", "barriers"],
    relatedSlugs: ["fault-tree-analysis", "barrier-analysis", "fishbone-diagram"],
    workflow: {
      title: "Bow-Tie Analysis",
      description: "Map threats, barriers, and consequences around a central event.",
      steps: [
        { title: "Identify Hazardous Event", description: "Define the central event — the moment control is lost.", durationMinutes: 10, deliverable: "Hazardous event definition" },
        { title: "Map Threats (Left Side)", description: "Identify all threats that could cause the event. Draw as left-side branches.", durationMinutes: 20, deliverable: "Threat inventory" },
        { title: "Map Preventive Barriers", description: "For each threat, identify barriers that prevent the event. Place between threat and center.", durationMinutes: 20, deliverable: "Preventive barrier map" },
        { title: "Map Consequences (Right Side)", description: "Identify all possible consequences if the event occurs.", durationMinutes: 15, deliverable: "Consequence inventory" },
        { title: "Map Mitigating Barriers", description: "Identify barriers that reduce consequence severity. Place between center and consequence.", durationMinutes: 20, deliverable: "Complete bow-tie diagram" },
        { title: "Assess Barrier Quality", description: "Rate each barrier's effectiveness and identify gaps.", durationMinutes: 15, deliverable: "Barrier effectiveness assessment" },
      ],
    },
    fitRules: [
      { dimension: "risk_level", weight: 2.0, min: 4, max: 5 },
      { dimension: "complexity", weight: 1.5, min: 3, max: 5 },
      { dimension: "stakeholder_count", weight: 1.3, min: 3, max: 5 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Category 2: Creative Problem Solving (10 methods)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    slug: "triz",
    name: "TRIZ",
    categorySlug: "creative-problem-solving",
    description: "Theory of Inventive Problem Solving — systematic innovation methodology using contradiction analysis and inventive principles.",
    summary: "Developed by Genrich Altshuller from studying 200,000+ patents, TRIZ provides a structured approach to innovation. It identifies technical and physical contradictions in a problem, then applies 40 inventive principles to resolve them. TRIZ assumes that similar problems have been solved before in other fields, and solutions can be transferred systematically.",
    complexity: "high",
    timeframe: "long",
    participantsMin: 2,
    participantsMax: 8,
    bestFor: "Engineering and technical design problems with inherent contradictions. When conventional approaches hit physical or technical limits.",
    tools: "TRIZ contradiction matrix, 40 inventive principles, substance-field analysis tools. Software: CREAX, IFR.",
    example: "Need an aircraft wing that is both rigid (for strength) and flexible (for aerodynamics). Contradiction matrix suggests Principle #15 (Dynamics) — use variable-geometry wing components that adjust in flight.",
    aliases: ["Theory of Inventive Problem Solving", "TIPS", "Altshuller Method"],
    tags: ["creative", "innovation", "systematic", "engineering", "contradiction"],
    relatedSlugs: ["scamper", "morphological-analysis", "design-thinking"],
    workflow: {
      title: "TRIZ Problem Solving",
      description: "Systematic contradiction resolution for innovation.",
      steps: [
        { title: "Define Problem", description: "Describe the problem and identify the ideal final result (IFR) — what would perfection look like?", durationMinutes: 20, deliverable: "Problem & IFR statement" },
        { title: "Identify Contradictions", description: "Find the technical contradiction: improving parameter A worsens parameter B.", durationMinutes: 30, deliverable: "Contradiction statement" },
        { title: "Apply Contradiction Matrix", description: "Look up the improving and worsening parameters in the TRIZ matrix to find suggested inventive principles.", durationMinutes: 20, deliverable: "Suggested principles list" },
        { title: "Generate Solutions", description: "Apply each suggested principle to your specific problem. Generate multiple solution concepts.", durationMinutes: 40, deliverable: "Solution concepts" },
        { title: "Evaluate and Select", description: "Assess feasibility and effectiveness of each concept. Select best approach.", durationMinutes: 20, deliverable: "Selected solution" },
      ],
    },
    fitRules: [
      { dimension: "innovation_need", weight: 2.0, min: 4, max: 5 },
      { dimension: "complexity", weight: 1.5, min: 3, max: 5 },
      { dimension: "data_availability", weight: 1.2, min: 2, max: 5 },
    ],
  },

  {
    slug: "scamper",
    name: "SCAMPER",
    categorySlug: "creative-problem-solving",
    description: "Checklist-based ideation technique: Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse.",
    summary: "SCAMPER provides seven lenses through which to examine and transform existing products, services, or processes. Each letter represents a different type of transformation to consider. It's particularly effective because it gives structure to creative thinking, preventing the blank-page problem.",
    complexity: "low",
    timeframe: "short",
    participantsMin: 1,
    participantsMax: 10,
    bestFor: "Product improvement, service redesign, process innovation. Great when you need to generate ideas quickly from an existing baseline.",
    tools: "SCAMPER checklist/worksheet, whiteboard, sticky notes.",
    example: "Improving a coffee shop: Substitute (plant milk default), Combine (coffee + coworking), Adapt (drive-through for bikes), Modify (supersized loyalty program), Put to other use (event space at night), Eliminate (paper cups), Reverse (customer roasts their own beans).",
    aliases: ["SCAMPER Technique", "SCAMPER Checklist"],
    tags: ["creative", "ideation", "quick", "checklist", "product"],
    relatedSlugs: ["brainstorming", "mind-mapping", "reverse-brainstorming"],
    workflow: {
      title: "SCAMPER Ideation",
      description: "Seven-lens creative transformation.",
      steps: [
        { title: "Define Subject", description: "Identify the product, service, or process to improve.", durationMinutes: 5, deliverable: "Subject description" },
        { title: "Apply Each Letter", description: "Work through S-C-A-M-P-E-R, generating at least 2 ideas per letter.", durationMinutes: 30, deliverable: "14+ raw ideas" },
        { title: "Expand Best Ideas", description: "Select the 3-5 most promising ideas and flesh them out further.", durationMinutes: 15, deliverable: "Expanded idea sketches" },
        { title: "Evaluate Feasibility", description: "Rate each expanded idea on impact, feasibility, and effort.", durationMinutes: 10, deliverable: "Prioritized idea list" },
      ],
    },
    fitRules: [
      { dimension: "innovation_need", weight: 2.0, min: 3, max: 5 },
      { dimension: "urgency", weight: 1.3, min: 2, max: 5 },
      { dimension: "collaboration_intensity", weight: 1.0, min: 1, max: 5 },
    ],
  },

  {
    slug: "brainstorming",
    name: "Brainstorming",
    categorySlug: "creative-problem-solving",
    description: "Group ideation session focused on generating as many ideas as possible without immediate judgment.",
    summary: "Classic brainstorming follows four rules: defer judgment, go for quantity, build on others' ideas, and encourage wild ideas. A facilitator guides the group to generate maximum volume of ideas before any evaluation. While simple, effective brainstorming requires good facilitation to prevent groupthink and ensure psychological safety.",
    complexity: "low", timeframe: "short", participantsMin: 3, participantsMax: 15,
    bestFor: "Early-stage ideation when many options are needed. Works best with diverse participants and a skilled facilitator.",
    tools: "Whiteboard, sticky notes, flip charts. Digital: Miro, MURAL, Stormboard.",
    example: "A retail team generates 80+ ideas in 30 minutes for improving customer experience, from greeting scripts to store layout changes to app features.",
    aliases: ["Brain Storming", "Ideation Session", "Idea Generation"],
    tags: ["creative", "ideation", "group", "quick", "facilitation"],
    relatedSlugs: ["reverse-brainstorming", "nominal-group-technique", "scamper", "mind-mapping"],
    workflow: { title: "Brainstorming Session", description: "Generate maximum ideas without judgment.", steps: [
      { title: "Set the Rules", description: "Brief participants on the 4 rules: defer judgment, quantity over quality, build on ideas, encourage wild ideas.", durationMinutes: 5, deliverable: "Aligned group" },
      { title: "Present the Challenge", description: "Frame the problem as a clear 'How might we...' question.", durationMinutes: 5, deliverable: "Challenge statement" },
      { title: "Generate Ideas", description: "Rapid-fire idea generation. Capture every idea visibly. 1 idea per sticky note.", durationMinutes: 20, deliverable: "Idea wall (50+ ideas)" },
      { title: "Cluster and Theme", description: "Group similar ideas into themes. Name each cluster.", durationMinutes: 10, deliverable: "Themed idea clusters" },
      { title: "Select and Refine", description: "Vote on top ideas. Develop the winners into actionable concepts.", durationMinutes: 15, deliverable: "Top 5 concepts" },
    ]},
    fitRules: [
      { dimension: "innovation_need", weight: 1.5, min: 2, max: 5 },
      { dimension: "collaboration_intensity", weight: 2.0, min: 3, max: 5 },
      { dimension: "uncertainty_level", weight: 1.3, min: 2, max: 5 },
    ],
  },

  {
    slug: "mind-mapping",
    name: "Mind Mapping",
    categorySlug: "creative-problem-solving",
    description: "Visual technique radiating ideas from a central topic to explore associations and connections.",
    summary: "Mind mapping starts with a central topic and branches outward with related subtopics, ideas, and associations. The non-linear visual format mirrors how the brain naturally processes information, enabling free-flowing ideation and revealing unexpected connections between concepts.",
    complexity: "low", timeframe: "short", participantsMin: 1, participantsMax: 8,
    bestFor: "Exploring the full scope of a topic, planning, note-taking, organizing complex information, or structuring a presentation.",
    tools: "Paper and colored pens. Software: MindMeister, XMind, Coggle, FreeMind.",
    example: "Mapping all aspects of a product launch: center = 'Product Launch', branches = Marketing, Sales, Engineering, Legal, Support, each with sub-branches for specific tasks.",
    aliases: ["Mind Map", "Concept Map", "Idea Map"],
    tags: ["creative", "visual", "planning", "individual", "exploration"],
    relatedSlugs: ["brainstorming", "fishbone-diagram", "rich-pictures"],
    workflow: { title: "Mind Mapping Session", description: "Visual exploration from center outward.", steps: [
      { title: "Place Central Topic", description: "Write the main topic or question in the center of a large surface.", durationMinutes: 2, deliverable: "Central node" },
      { title: "Add Main Branches", description: "Draw 4-8 main branches for key aspects or categories.", durationMinutes: 5, deliverable: "Main branches" },
      { title: "Expand Sub-Branches", description: "For each branch, add sub-branches with related ideas. Use colors and images.", durationMinutes: 20, deliverable: "Detailed mind map" },
      { title: "Identify Connections", description: "Draw cross-links between related items on different branches.", durationMinutes: 10, deliverable: "Connected mind map" },
      { title: "Extract Insights", description: "Review the map for patterns, gaps, and key insights.", durationMinutes: 10, deliverable: "Key insights list" },
    ]},
    fitRules: [
      { dimension: "uncertainty_level", weight: 1.5, min: 2, max: 5 },
      { dimension: "innovation_need", weight: 1.3, min: 2, max: 5 },
      { dimension: "complexity", weight: 1.2, min: 2, max: 4 },
    ],
  },

  {
    slug: "lateral-thinking",
    name: "Lateral Thinking",
    categorySlug: "creative-problem-solving",
    description: "Edward de Bono's approach to solving problems through indirect and creative reasoning, challenging assumptions.",
    summary: "Lateral thinking deliberately breaks established patterns of thought. Instead of following the obvious logical path (vertical thinking), it uses provocations, random entry points, and assumption challenges to find solutions that would never emerge from conventional analysis. The goal is to restructure patterns to create new ones.",
    complexity: "medium", timeframe: "medium", participantsMin: 1, participantsMax: 10,
    bestFor: "Stuck problems where conventional approaches have failed. Innovation challenges requiring fresh perspectives.",
    tools: "Provocation techniques (Po), random word generators, challenge exercises.",
    example: "Factory pollution problem: vertical thinking = better filters. Lateral thinking = 'Po: the factory is downstream of itself' → relocate intake downstream of discharge, forcing the factory to clean its own water.",
    aliases: ["De Bono Lateral Thinking", "Creative Thinking", "Non-Linear Thinking"],
    tags: ["creative", "unconventional", "assumptions", "innovation", "reframing"],
    relatedSlugs: ["six-thinking-hats", "reverse-brainstorming", "triz", "provocation"],
    workflow: { title: "Lateral Thinking Session", description: "Break conventional patterns to find novel solutions.", steps: [
      { title: "Define the Problem", description: "State the problem clearly. Identify what conventional thinking has already produced.", durationMinutes: 10, deliverable: "Problem + conventional solutions" },
      { title: "Challenge Assumptions", description: "List all assumptions about the problem. Challenge each one: What if the opposite were true?", durationMinutes: 15, deliverable: "Challenged assumptions list" },
      { title: "Apply Provocations", description: "Use 'Po' (provocative operation): make deliberately absurd statements to trigger new thinking.", durationMinutes: 20, deliverable: "Provocation-triggered ideas" },
      { title: "Use Random Entry", description: "Pick a random word/image and force connections to the problem.", durationMinutes: 15, deliverable: "Random-entry ideas" },
      { title: "Harvest Ideas", description: "Review all ideas, extract movement from provocations, select viable concepts.", durationMinutes: 15, deliverable: "Novel solution concepts" },
    ]},
    fitRules: [
      { dimension: "innovation_need", weight: 2.0, min: 4, max: 5 },
      { dimension: "uncertainty_level", weight: 1.5, min: 3, max: 5 },
      { dimension: "collaboration_intensity", weight: 1.0, min: 1, max: 5 },
    ],
  },

  {
    slug: "morphological-analysis",
    name: "Morphological Analysis",
    categorySlug: "creative-problem-solving",
    description: "Systematic method that decomposes a problem into dimensions, lists options for each, then combines them to create novel solutions.",
    summary: "Fritz Zwicky's morphological analysis creates a matrix where rows are problem dimensions and columns are possible values. By systematically combining one option from each dimension, you generate a large solution space. This ensures you explore combinations that intuition alone would miss.",
    complexity: "medium", timeframe: "medium", participantsMin: 2, participantsMax: 8,
    bestFor: "Design problems with multiple independent parameters. Product design, service configuration, organizational structure design.",
    tools: "Morphological box/matrix template, spreadsheet. Software: Morphological analysis tools.",
    example: "Designing a new delivery service: Dimensions = Vehicle (bike/van/drone), Area (urban/suburban/rural), Speed (same-day/next-day/scheduled), Payment (subscription/per-use/free). Combine: drone + urban + same-day + subscription = premium urban drone delivery.",
    aliases: ["Morphological Box", "Zwicky Box", "Morphological Matrix"],
    tags: ["creative", "systematic", "design", "combinations", "innovation"],
    relatedSlugs: ["triz", "scamper", "design-thinking"],
    workflow: { title: "Morphological Analysis", description: "Systematic solution space exploration.", steps: [
      { title: "Decompose Problem", description: "Identify 4-7 independent dimensions/parameters of the problem.", durationMinutes: 15, deliverable: "Dimension list" },
      { title: "List Options per Dimension", description: "For each dimension, list 3-6 possible values or options.", durationMinutes: 20, deliverable: "Morphological matrix" },
      { title: "Generate Combinations", description: "Systematically or randomly combine options across dimensions to create configurations.", durationMinutes: 20, deliverable: "Configuration list (20-30)" },
      { title: "Screen for Feasibility", description: "Eliminate impossible or contradictory combinations. Mark feasible ones.", durationMinutes: 15, deliverable: "Feasible configurations" },
      { title: "Evaluate Best Candidates", description: "Score remaining configurations on criteria. Select top 3-5.", durationMinutes: 15, deliverable: "Top solution candidates" },
    ]},
    fitRules: [
      { dimension: "innovation_need", weight: 1.8, min: 3, max: 5 },
      { dimension: "complexity", weight: 1.5, min: 3, max: 5 },
      { dimension: "decision_making_need", weight: 1.2, min: 2, max: 5 },
    ],
  },

  {
    slug: "reverse-brainstorming",
    name: "Reverse Brainstorming",
    categorySlug: "creative-problem-solving",
    description: "Instead of solving the problem, brainstorm ways to cause or worsen it, then reverse those ideas into solutions.",
    summary: "By asking 'How could we make this problem worse?' you engage a different thinking mode that often reveals hidden factors and unconventional solutions. People find it easier and more fun to think of ways to break things, and the reversal produces surprisingly actionable insights.",
    complexity: "low", timeframe: "short", participantsMin: 3, participantsMax: 12,
    bestFor: "When regular brainstorming has stalled. Great for quality problems, customer experience issues, and process failures.",
    tools: "Whiteboard, sticky notes. Standard facilitation materials.",
    example: "How to reduce customer churn → reverse: 'How to maximize customer churn?' Ideas: ignore complaints, make cancellation easy, raise prices randomly, break the product. Reverse: proactive support, add friction to cancellation with retention offers, transparent pricing, reliability focus.",
    aliases: ["Negative Brainstorming", "Reverse Thinking", "How to Make Things Worse"],
    tags: ["creative", "group", "fun", "quick", "reframing"],
    relatedSlugs: ["brainstorming", "lateral-thinking", "provocation"],
    workflow: { title: "Reverse Brainstorming", description: "Break things to find how to fix them.", steps: [
      { title: "State the Reverse Problem", description: "Flip the problem: 'How could we cause/worsen X?' Make it fun.", durationMinutes: 5, deliverable: "Reverse problem statement" },
      { title: "Brainstorm Causes", description: "Generate ideas for causing the problem. No judgment. Go wild.", durationMinutes: 15, deliverable: "Ways to worsen the problem" },
      { title: "Reverse Each Idea", description: "Flip each negative idea into a positive solution.", durationMinutes: 15, deliverable: "Reversed solution ideas" },
      { title: "Select Best Solutions", description: "Vote on and prioritize the most actionable reversed ideas.", durationMinutes: 10, deliverable: "Top solution list" },
    ]},
    fitRules: [
      { dimension: "innovation_need", weight: 1.5, min: 2, max: 5 },
      { dimension: "collaboration_intensity", weight: 1.8, min: 3, max: 5 },
      { dimension: "uncertainty_level", weight: 1.3, min: 2, max: 5 },
    ],
  },

  {
    slug: "synectics",
    name: "Synectics",
    categorySlug: "creative-problem-solving",
    description: "Uses analogies and metaphors from unrelated domains to spark creative solutions to complex problems.",
    summary: "Synectics ('joining together of different and apparently irrelevant elements') uses four types of analogy — direct, personal, symbolic, and fantasy — to make the strange familiar and the familiar strange. By finding parallel structures in nature, other industries, or abstract concepts, teams discover breakthrough solutions.",
    complexity: "medium", timeframe: "medium", participantsMin: 4, participantsMax: 10,
    bestFor: "Breakthrough innovation needed, technical challenges requiring cross-domain inspiration, design problems.",
    tools: "Facilitator guide, analogy prompts, diverse reference materials.",
    example: "Designing a better can opener: Direct analogy — how do clams open? Personal analogy — if I were the can, how would I want to be opened? Symbolic analogy — 'lazy opening' = effortless entry. Led to pull-tab design concept.",
    aliases: ["Synectics Method", "Analogical Thinking", "Gordon Method"],
    tags: ["creative", "analogy", "metaphor", "breakthrough", "facilitated"],
    relatedSlugs: ["lateral-thinking", "triz", "design-thinking"],
    workflow: { title: "Synectics Session", description: "Cross-domain analogy for creative solutions.", steps: [
      { title: "Define Problem as Given", description: "State the problem in its current framing.", durationMinutes: 5, deliverable: "Problem as given (PAG)" },
      { title: "Make the Strange Familiar", description: "Analyze the problem using existing knowledge. Understand all aspects.", durationMinutes: 15, deliverable: "Problem understanding" },
      { title: "Make the Familiar Strange", description: "Apply analogies: direct (nature/other fields), personal (empathize with the object), symbolic (compressed metaphor), fantasy (ideal magic solution).", durationMinutes: 30, deliverable: "Analogy explorations" },
      { title: "Force Fit", description: "Connect the best analogies back to the problem. How does the analogy suggest a real solution?", durationMinutes: 20, deliverable: "Analogy-derived solutions" },
      { title: "Develop Concept", description: "Select the strongest force-fit and develop it into a viable concept.", durationMinutes: 15, deliverable: "Solution concept" },
    ]},
    fitRules: [
      { dimension: "innovation_need", weight: 2.0, min: 4, max: 5 },
      { dimension: "collaboration_intensity", weight: 1.5, min: 3, max: 5 },
      { dimension: "complexity", weight: 1.3, min: 3, max: 5 },
    ],
  },

  {
    slug: "provocation",
    name: "Provocation (Po)",
    categorySlug: "creative-problem-solving",
    description: "De Bono's technique of making deliberately provocative statements to escape established thinking patterns.",
    summary: "Using the signal word 'Po' (provocative operation), you make a statement that is intentionally illogical or impossible within the current frame. The provocation isn't meant to be a solution itself — it's a stepping stone. You then extract 'movement' by asking what interesting ideas the provocation triggers.",
    complexity: "low", timeframe: "short", participantsMin: 1, participantsMax: 8,
    bestFor: "Breaking through creative blocks, escaping dominant thinking patterns, generating truly novel ideas.",
    tools: "Facilitator to guide the 'movement' extraction. Whiteboard for capturing provocations and derived ideas.",
    example: "Problem: reduce hospital infections. Po: patients operate on doctors. Movement: patients could do self-care tasks, reducing nurse contact. Po: the hospital has no walls. Movement: more outpatient care, telemedicine, home recovery programs.",
    aliases: ["Po Technique", "Provocative Operation", "De Bono Provocation"],
    tags: ["creative", "provocation", "quick", "breakthrough", "de-bono"],
    relatedSlugs: ["lateral-thinking", "reverse-brainstorming", "six-thinking-hats"],
    workflow: { title: "Provocation Session", description: "Escape conventional thinking via deliberate provocation.", steps: [
      { title: "State the Focus", description: "Define the topic or problem area clearly.", durationMinutes: 5, deliverable: "Focus statement" },
      { title: "Generate Provocations", description: "Create 5-8 'Po' statements: reversal, exaggeration, distortion, or wishful thinking.", durationMinutes: 10, deliverable: "Provocation list" },
      { title: "Extract Movement", description: "For each provocation, ask: What's interesting? What does this suggest? Where does this lead?", durationMinutes: 20, deliverable: "Movement ideas" },
      { title: "Develop Concepts", description: "Turn the best movement ideas into practical concepts.", durationMinutes: 15, deliverable: "Practical concepts" },
    ]},
    fitRules: [
      { dimension: "innovation_need", weight: 2.0, min: 4, max: 5 },
      { dimension: "uncertainty_level", weight: 1.5, min: 3, max: 5 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Category 3: Decision Making (10 methods)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    slug: "decision-matrix",
    name: "Decision Matrix",
    categorySlug: "decision-making",
    description: "Weighted scoring matrix for comparing alternatives against defined criteria.",
    summary: "A decision matrix lists alternatives as rows and evaluation criteria as columns. Each criterion is weighted by importance, and each alternative is scored against each criterion. The weighted scores are summed to produce a total score per alternative, making the trade-offs explicit and transparent.",
    complexity: "low", timeframe: "short", participantsMin: 1, participantsMax: 10,
    bestFor: "Any multi-criteria decision with 3+ alternatives. Vendor selection, technology choice, hiring decisions.",
    tools: "Spreadsheet, decision matrix template. Software: 1000minds, Criterium.",
    example: "Selecting a CRM: criteria = cost (30%), features (25%), ease of use (20%), integrations (15%), support (10%). Score each vendor 1-5, multiply by weight, sum. Salesforce: 3.6, HubSpot: 4.1, Zoho: 3.8 → HubSpot wins.",
    aliases: ["Weighted Scoring Matrix", "Pugh Matrix", "Criteria Matrix", "Grid Analysis"],
    tags: ["decision", "structured", "quantitative", "comparison", "transparent"],
    relatedSlugs: ["ahp", "cost-benefit-analysis", "paired-comparison"],
    workflow: { title: "Decision Matrix", description: "Weighted multi-criteria comparison.", steps: [
      { title: "Define Alternatives", description: "List all alternatives under consideration (3-8).", durationMinutes: 5, deliverable: "Alternatives list" },
      { title: "Define Criteria", description: "Identify 4-8 evaluation criteria. What matters for this decision?", durationMinutes: 10, deliverable: "Criteria list" },
      { title: "Assign Weights", description: "Distribute 100% across criteria based on relative importance.", durationMinutes: 10, deliverable: "Weighted criteria" },
      { title: "Score Alternatives", description: "Score each alternative 1-5 against each criterion. Use data where possible.", durationMinutes: 20, deliverable: "Scored matrix" },
      { title: "Calculate and Decide", description: "Multiply scores by weights, sum totals. Discuss results and make decision.", durationMinutes: 10, deliverable: "Decision with rationale" },
    ]},
    fitRules: [
      { dimension: "decision_making_need", weight: 2.0, min: 3, max: 5 },
      { dimension: "data_availability", weight: 1.3, min: 2, max: 5 },
      { dimension: "stakeholder_count", weight: 1.2, min: 2, max: 5 },
    ],
  },

  {
    slug: "ahp",
    name: "Analytic Hierarchy Process",
    categorySlug: "decision-making",
    description: "Structured pairwise comparison method that derives ratio-scale priorities from subjective judgments.",
    summary: "AHP decomposes a complex decision into a hierarchy of goal, criteria, sub-criteria, and alternatives. At each level, elements are compared pairwise on a 1-9 scale. Mathematical processing derives consistent weights and priorities. It handles both quantitative and qualitative criteria and checks judgment consistency.",
    complexity: "high", timeframe: "medium", participantsMin: 1, participantsMax: 6,
    bestFor: "High-stakes decisions with intangible criteria. Strategic resource allocation, major investments, policy decisions.",
    tools: "AHP software: Expert Choice, Super Decisions, PriEsT. Or spreadsheet with eigenvalue calculations.",
    example: "Selecting a new office location: Goal = Best Office. Criteria = Cost, Accessibility, Space, Image. Pairwise: Cost vs Accessibility → Cost moderately more important (3). Process all pairs to derive weights, then compare locations.",
    aliases: ["AHP", "Saaty Method", "Analytic Hierarchy"],
    tags: ["decision", "pairwise", "quantitative", "hierarchy", "strategic"],
    relatedSlugs: ["decision-matrix", "multi-criteria-decision-analysis", "cost-benefit-analysis"],
    workflow: { title: "AHP Decision Process", description: "Rigorous pairwise comparison hierarchy.", steps: [
      { title: "Build Hierarchy", description: "Decompose decision into goal → criteria → sub-criteria → alternatives.", durationMinutes: 15, deliverable: "Decision hierarchy" },
      { title: "Pairwise Compare Criteria", description: "Compare each pair of criteria: which is more important and by how much? (1-9 scale)", durationMinutes: 20, deliverable: "Criteria comparison matrix" },
      { title: "Calculate Weights", description: "Derive priority weights using eigenvalue method. Check consistency ratio (<0.1).", durationMinutes: 15, deliverable: "Criteria weights" },
      { title: "Compare Alternatives", description: "For each criterion, pairwise compare alternatives.", durationMinutes: 30, deliverable: "Alternative scores per criterion" },
      { title: "Synthesize Results", description: "Multiply alternative scores by criteria weights. Sum for overall priority.", durationMinutes: 10, deliverable: "Final ranking with rationale" },
    ]},
    fitRules: [
      { dimension: "decision_making_need", weight: 2.0, min: 4, max: 5 },
      { dimension: "complexity", weight: 1.5, min: 3, max: 5 },
      { dimension: "stakeholder_count", weight: 1.3, min: 2, max: 5 },
    ],
  },

  {
    slug: "cost-benefit-analysis",
    name: "Cost-Benefit Analysis",
    categorySlug: "decision-making",
    description: "Systematic comparison of the total costs and total benefits of each alternative, often in monetary terms.",
    summary: "CBA quantifies all costs and benefits of each option in comparable units (usually money). It considers direct/indirect costs, tangible/intangible benefits, and time value of money. The alternative with the highest net benefit or benefit-cost ratio is preferred. Essential for investment decisions and policy evaluation.",
    complexity: "medium", timeframe: "medium", participantsMin: 1, participantsMax: 6,
    bestFor: "Investment decisions, project selection, policy evaluation, make-vs-buy decisions.",
    tools: "Spreadsheet with NPV/IRR formulas, financial modeling tools.",
    example: "Should we automate the warehouse? Costs: $2M setup, $100K/yr maintenance. Benefits: $800K/yr labor savings, $200K/yr fewer errors, $100K/yr faster throughput. NPV over 5 years at 10% discount: +$1.7M → proceed.",
    aliases: ["CBA", "Benefit-Cost Analysis", "Economic Analysis"],
    tags: ["decision", "financial", "quantitative", "ROI", "investment"],
    relatedSlugs: ["decision-matrix", "ahp", "decision-tree"],
    workflow: { title: "Cost-Benefit Analysis", description: "Quantify and compare costs vs. benefits.", steps: [
      { title: "Define Alternatives", description: "List options including the status quo (do nothing).", durationMinutes: 10, deliverable: "Alternative definitions" },
      { title: "Identify All Costs", description: "List direct, indirect, one-time, and recurring costs for each alternative over the time horizon.", durationMinutes: 30, deliverable: "Cost inventory" },
      { title: "Identify All Benefits", description: "List tangible and intangible benefits. Quantify in monetary terms where possible.", durationMinutes: 30, deliverable: "Benefits inventory" },
      { title: "Calculate Net Present Value", description: "Discount future cash flows to present value. Calculate NPV, IRR, payback period.", durationMinutes: 20, deliverable: "Financial analysis" },
      { title: "Sensitivity Analysis", description: "Vary key assumptions to test robustness. What changes the decision?", durationMinutes: 15, deliverable: "Sensitivity results and recommendation" },
    ]},
    fitRules: [
      { dimension: "decision_making_need", weight: 1.8, min: 3, max: 5 },
      { dimension: "data_availability", weight: 1.8, min: 3, max: 5 },
      { dimension: "risk_level", weight: 1.3, min: 2, max: 5 },
    ],
  },

  {
    slug: "delphi-method",
    name: "Delphi Method",
    categorySlug: "decision-making",
    description: "Iterative anonymous expert consultation process for converging on informed judgment.",
    summary: "The Delphi method collects anonymous opinions from a panel of experts over multiple rounds. After each round, a facilitator summarizes responses and shares them (anonymously) with the panel. Experts reconsider their positions in light of peer input. Typically converges in 2-4 rounds. Eliminates groupthink and dominance effects.",
    complexity: "medium", timeframe: "long", participantsMin: 5, participantsMax: 30,
    bestFor: "Forecasting, technology assessment, policy development, situations where expert opinion is needed but face-to-face debate would be biased.",
    tools: "Survey tools (Google Forms, SurveyMonkey), spreadsheet for analysis.",
    example: "Predicting AI's impact on healthcare in 10 years: 15 experts give estimates anonymously. Round 1 shows wide range. After sharing anonymized summary, Round 2 narrows. By Round 3, consensus emerges on 3-5 key predictions.",
    aliases: ["Delphi Technique", "Expert Panel Method"],
    tags: ["decision", "expert", "consensus", "anonymous", "forecasting"],
    relatedSlugs: ["nominal-group-technique", "scenario-planning", "dot-voting"],
    workflow: { title: "Delphi Process", description: "Iterative anonymous expert consultation.", steps: [
      { title: "Select Expert Panel", description: "Identify 5-30 experts with diverse but relevant expertise. Secure their commitment for 3-4 rounds.", durationMinutes: 60, deliverable: "Expert panel roster" },
      { title: "Round 1: Open Questions", description: "Send open-ended questionnaire. Collect initial views, estimates, and reasoning.", durationMinutes: 30, deliverable: "Round 1 responses" },
      { title: "Summarize and Redistribute", description: "Anonymize and summarize Round 1. Highlight areas of agreement and disagreement.", durationMinutes: 30, deliverable: "Round 1 summary" },
      { title: "Round 2-3: Refine", description: "Experts reconsider in light of peer responses. Ask to explain outlier positions.", durationMinutes: 30, deliverable: "Converging responses" },
      { title: "Final Summary", description: "Compile final consensus view with remaining areas of disagreement and rationales.", durationMinutes: 20, deliverable: "Delphi report" },
    ]},
    fitRules: [
      { dimension: "uncertainty_level", weight: 2.0, min: 4, max: 5 },
      { dimension: "stakeholder_count", weight: 1.5, min: 3, max: 5 },
      { dimension: "decision_making_need", weight: 1.3, min: 3, max: 5 },
    ],
  },

  {
    slug: "multi-criteria-decision-analysis",
    name: "Multi-Criteria Decision Analysis",
    categorySlug: "decision-making",
    description: "Umbrella framework for evaluating alternatives against multiple conflicting criteria using structured methods.",
    summary: "MCDA provides a systematic framework for decisions involving multiple, often conflicting objectives. It encompasses various techniques (ELECTRE, PROMETHEE, TOPSIS) that handle trade-offs transparently. MCDA is particularly valuable when stakeholders have different priorities.",
    complexity: "high", timeframe: "medium", participantsMin: 2, participantsMax: 10,
    bestFor: "Complex decisions with conflicting objectives, multi-stakeholder environments, policy decisions.",
    tools: "Specialized MCDA software (D-Sight, VISA), spreadsheet.",
    example: "Selecting a hospital site: criteria include patient access, construction cost, environmental impact, community benefit, and traffic. MCDA reveals Site B isn't cheapest but best overall when all stakeholders' priorities are balanced.",
    aliases: ["MCDA", "Multi-Criteria Analysis", "MCA"],
    tags: ["decision", "multi-criteria", "stakeholder", "structured", "trade-off"],
    relatedSlugs: ["ahp", "decision-matrix", "force-field-analysis"],
    workflow: { title: "MCDA Process", description: "Structured multi-criteria evaluation.", steps: [
      { title: "Structure the Problem", description: "Define alternatives, criteria, and stakeholders.", durationMinutes: 20, deliverable: "Problem structure" },
      { title: "Elicit Preferences", description: "Determine criteria weights from stakeholders. Handle conflicts transparently.", durationMinutes: 30, deliverable: "Agreed criteria weights" },
      { title: "Score Alternatives", description: "Evaluate each alternative against each criterion using appropriate scales.", durationMinutes: 30, deliverable: "Performance matrix" },
      { title: "Aggregate and Rank", description: "Apply the chosen MCDA method to combine scores. Present ranking.", durationMinutes: 15, deliverable: "Ranked alternatives" },
      { title: "Sensitivity and Decision", description: "Test sensitivity to weight changes. Confirm robust recommendation.", durationMinutes: 15, deliverable: "Recommendation with confidence" },
    ]},
    fitRules: [
      { dimension: "decision_making_need", weight: 2.0, min: 4, max: 5 },
      { dimension: "stakeholder_count", weight: 1.8, min: 3, max: 5 },
      { dimension: "complexity", weight: 1.5, min: 4, max: 5 },
    ],
  },

  {
    slug: "decision-tree",
    name: "Decision Tree Analysis",
    categorySlug: "decision-making",
    description: "Visual model of decisions, chance events, and outcomes used to calculate expected values under uncertainty.",
    summary: "Decision trees map sequential decisions and uncertain events as branching nodes. Decision nodes (squares) represent choices, chance nodes (circles) represent uncertain outcomes with probabilities, and terminal nodes show payoffs. Expected values are calculated by folding back from right to left, revealing the optimal decision path.",
    complexity: "medium", timeframe: "medium", participantsMin: 1, participantsMax: 5,
    bestFor: "Sequential decisions under uncertainty where probabilities can be estimated. Investment decisions, product launches, medical treatment choices.",
    tools: "Decision tree software (TreeAge, Precision Tree), spreadsheet, or simple drawing tools.",
    example: "Launch a new product? Decision: launch ($5M) or don't ($0). If launch: 60% chance of success ($20M revenue) or 40% failure ($2M revenue). Expected value of launch: 0.6×15 + 0.4×(-3) = $7.8M → launch.",
    aliases: ["Decision Tree", "Expected Value Analysis", "Decision Analysis"],
    tags: ["decision", "probability", "quantitative", "uncertainty", "visual"],
    relatedSlugs: ["cost-benefit-analysis", "monte-carlo-simulation", "bayesian-analysis"],
    workflow: { title: "Decision Tree Analysis", description: "Map decisions and uncertain outcomes.", steps: [
      { title: "Identify Decision Points", description: "What decisions need to be made? In what sequence?", durationMinutes: 10, deliverable: "Decision point list" },
      { title: "Map Chance Events", description: "For each decision outcome, what uncertain events could occur? What are the possible results?", durationMinutes: 20, deliverable: "Event branches" },
      { title: "Estimate Probabilities", description: "Assign probabilities to each chance branch. They must sum to 100% at each node.", durationMinutes: 15, deliverable: "Probability estimates" },
      { title: "Assign Payoffs", description: "Determine the monetary or utility value of each terminal outcome.", durationMinutes: 15, deliverable: "Payoff values" },
      { title: "Fold Back and Decide", description: "Calculate expected values from right to left. At each decision node, choose the branch with highest EV.", durationMinutes: 10, deliverable: "Optimal decision path" },
    ]},
    fitRules: [
      { dimension: "decision_making_need", weight: 2.0, min: 3, max: 5 },
      { dimension: "uncertainty_level", weight: 1.5, min: 3, max: 5 },
      { dimension: "data_availability", weight: 1.3, min: 2, max: 5 },
    ],
  },

  {
    slug: "force-field-analysis",
    name: "Force Field Analysis",
    categorySlug: "decision-making",
    description: "Kurt Lewin's model identifying driving forces (for change) and restraining forces (against change) to develop strategy.",
    summary: "Force Field Analysis maps the forces pushing toward a desired change and the forces resisting it. By scoring the strength of each force, you can see the balance and develop strategies to strengthen drivers or weaken resistors. Often more effective to reduce restraining forces than to increase driving ones.",
    complexity: "low", timeframe: "short", participantsMin: 2, participantsMax: 12,
    bestFor: "Change management, decision evaluation, understanding resistance. Great for assessing whether a proposed change will succeed.",
    tools: "Whiteboard with center line, sticky notes, force strength scale (1-5).",
    example: "Implementing remote work: Driving forces (employee satisfaction +5, cost savings +4, talent pool +3) vs. Restraining (management trust -4, collaboration concerns -3, IT infrastructure -2). Net positive → proceed, but address trust issue.",
    aliases: ["Lewin Force Field", "Driving/Restraining Analysis"],
    tags: ["decision", "change-management", "visual", "quick", "group"],
    relatedSlugs: ["decision-matrix", "stakeholder-mapping", "swot-analysis"],
    workflow: { title: "Force Field Analysis", description: "Map forces for and against change.", steps: [
      { title: "Define the Change", description: "Clearly state the proposed change or decision.", durationMinutes: 5, deliverable: "Change statement" },
      { title: "Identify Driving Forces", description: "List all forces pushing toward the change. Score each 1-5 for strength.", durationMinutes: 15, deliverable: "Driving forces list" },
      { title: "Identify Restraining Forces", description: "List all forces opposing the change. Score each 1-5.", durationMinutes: 15, deliverable: "Restraining forces list" },
      { title: "Analyze Balance", description: "Compare total driving vs. restraining scores. Identify the strongest forces.", durationMinutes: 10, deliverable: "Force balance assessment" },
      { title: "Develop Strategy", description: "Plan actions to strengthen key drivers and weaken key restrainers.", durationMinutes: 15, deliverable: "Action strategy" },
    ]},
    fitRules: [
      { dimension: "decision_making_need", weight: 1.5, min: 2, max: 5 },
      { dimension: "stakeholder_count", weight: 1.5, min: 2, max: 5 },
      { dimension: "collaboration_intensity", weight: 1.3, min: 2, max: 5 },
    ],
  },

  {
    slug: "paired-comparison",
    name: "Paired Comparison Analysis",
    categorySlug: "decision-making",
    description: "Compare every option against every other option in pairs to determine relative ranking.",
    summary: "When it's hard to compare many items simultaneously, paired comparison simplifies by presenting just two items at a time. For each pair, you decide which is preferred. Tallying wins gives a clear ranking. It's intuitive and reduces the cognitive load of complex comparisons.",
    complexity: "low", timeframe: "short", participantsMin: 1, participantsMax: 5,
    bestFor: "Prioritizing a list of items, ranking requirements, determining preference order for 5-15 options.",
    tools: "Paired comparison matrix (spreadsheet or paper grid).",
    example: "Ranking 6 project proposals: compare A vs B, A vs C, A vs D, B vs C, etc. (15 pairs total). Count wins: Project D wins 4 comparisons → top priority.",
    aliases: ["Pairwise Comparison", "Pairwise Ranking"],
    tags: ["decision", "prioritization", "simple", "ranking", "quick"],
    relatedSlugs: ["ahp", "decision-matrix", "dot-voting"],
    workflow: { title: "Paired Comparison", description: "Systematic pairwise ranking.", steps: [
      { title: "List Items", description: "List all items to be compared (5-15 works best).", durationMinutes: 5, deliverable: "Item list" },
      { title: "Create Matrix", description: "Build an NxN matrix with items on both axes.", durationMinutes: 5, deliverable: "Comparison matrix" },
      { title: "Compare Each Pair", description: "For each cell, decide which item wins. Record the winner.", durationMinutes: 15, deliverable: "Completed matrix" },
      { title: "Tally and Rank", description: "Count wins per item. Rank from most to fewest wins.", durationMinutes: 5, deliverable: "Priority ranking" },
    ]},
    fitRules: [
      { dimension: "decision_making_need", weight: 2.0, min: 3, max: 5 },
      { dimension: "urgency", weight: 1.3, min: 2, max: 5 },
    ],
  },

  {
    slug: "pros-cons-fixes",
    name: "Pros, Cons, and Fixes",
    categorySlug: "decision-making",
    description: "Extended pros/cons analysis that adds a 'fixes' column to address each con, making evaluation more actionable.",
    summary: "Beyond simple pros and cons, this method adds a third dimension: for each con, identify a potential fix or mitigation. This transforms a static comparison into an active problem-solving exercise and often reveals that apparent deal-breakers have workable solutions.",
    complexity: "low", timeframe: "short", participantsMin: 1, participantsMax: 8,
    bestFor: "Quick decisions, evaluating proposals, team discussions about options when simplicity is valued.",
    tools: "Three-column table on whiteboard or document.",
    example: "Switching to open-source CRM: Pros (cost savings, flexibility), Cons (migration effort → Fix: phased migration; less support → Fix: hire consultant), Cons (fewer features → Fix: 80% covers our needs, build the rest).",
    aliases: ["Pros-Cons-Mitigations", "PMI (Plus-Minus-Interesting)"],
    tags: ["decision", "quick", "simple", "team", "evaluation"],
    relatedSlugs: ["decision-matrix", "force-field-analysis", "six-thinking-hats"],
    workflow: { title: "Pros, Cons, and Fixes", description: "Evaluate with built-in mitigation.", steps: [
      { title: "List Pros", description: "Enumerate all positive aspects of the option.", durationMinutes: 10, deliverable: "Pros list" },
      { title: "List Cons", description: "Enumerate all negatives, risks, and concerns.", durationMinutes: 10, deliverable: "Cons list" },
      { title: "Identify Fixes", description: "For each con, brainstorm a fix or mitigation. Rate difficulty of each fix.", durationMinutes: 15, deliverable: "Fixes list" },
      { title: "Assess Net Position", description: "With fixes applied, is the option still positive? Decide.", durationMinutes: 10, deliverable: "Decision with rationale" },
    ]},
    fitRules: [
      { dimension: "decision_making_need", weight: 1.5, min: 2, max: 5 },
      { dimension: "urgency", weight: 1.8, min: 3, max: 5 },
    ],
  },

  {
    slug: "kepner-tregoe-decision",
    name: "Kepner-Tregoe Decision Analysis",
    categorySlug: "decision-making",
    description: "Structured approach separating MUSTS (mandatory requirements) from WANTS (weighted desirables) to evaluate alternatives.",
    summary: "KT Decision Analysis first screens alternatives against mandatory MUST criteria (pass/fail). Survivors are then scored against weighted WANT criteria. Finally, a risk assessment evaluates adverse consequences of each surviving alternative. This three-step filtering produces well-justified decisions.",
    complexity: "medium", timeframe: "medium", participantsMin: 2, participantsMax: 8,
    bestFor: "Major purchases, vendor selection, technology decisions, hiring — any important choice with clear requirements.",
    tools: "KT Decision Analysis worksheet, spreadsheet.",
    example: "Selecting ERP system: MUSTs (cloud-hosted, supports 500+ users, SOC 2 compliant) — 2 vendors fail. WANTs (integration ease ×8, cost ×7, UX ×6) — remaining vendors scored. Risk assessment: Vendor A has acquisition rumors (high risk). Vendor B selected.",
    aliases: ["KT Decision Analysis", "MUST/WANT Analysis"],
    tags: ["decision", "structured", "requirements", "vendor-selection", "rational"],
    relatedSlugs: ["decision-matrix", "ahp", "kepner-tregoe-problem"],
    workflow: { title: "KT Decision Analysis", description: "MUST/WANT filtering with risk assessment.", steps: [
      { title: "Clarify Decision Purpose", description: "State the decision to be made and desired outcome.", durationMinutes: 5, deliverable: "Decision statement" },
      { title: "Define MUST Criteria", description: "List mandatory requirements. Each is pass/fail.", durationMinutes: 10, deliverable: "MUST criteria" },
      { title: "Define WANT Criteria", description: "List desirable criteria and weight each (1-10 importance).", durationMinutes: 15, deliverable: "Weighted WANT criteria" },
      { title: "Screen and Score", description: "Eliminate alternatives failing any MUST. Score survivors on WANTs.", durationMinutes: 20, deliverable: "Scored alternatives" },
      { title: "Risk Assessment", description: "For top alternatives, assess adverse consequences: probability and severity.", durationMinutes: 15, deliverable: "Risk-adjusted recommendation" },
    ]},
    fitRules: [
      { dimension: "decision_making_need", weight: 2.0, min: 4, max: 5 },
      { dimension: "risk_level", weight: 1.5, min: 3, max: 5 },
      { dimension: "data_availability", weight: 1.3, min: 3, max: 5 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Categories 4-10: Remaining 70 methods (abbreviated for manageable file size)
  // Each has full structure but shorter descriptions
  // ═══════════════════════════════════════════════════════════════════════════

  // Category 4: Process Improvement
  ...[
    { slug: "six-sigma-dmaic", name: "Six Sigma DMAIC", bestFor: "Reducing defects and variation in existing processes.", complexity: "high" as const, timeframe: "long" as const, pMin: 4, pMax: 12, tags: ["process", "quality", "data-driven", "six-sigma", "structured"] },
    { slug: "lean-thinking", name: "Lean Thinking", bestFor: "Eliminating waste and improving flow in any process.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 3, pMax: 15, tags: ["process", "waste", "flow", "toyota", "efficiency"] },
    { slug: "kaizen", name: "Kaizen", bestFor: "Continuous incremental improvements by frontline workers.", complexity: "low" as const, timeframe: "short" as const, pMin: 3, pMax: 12, tags: ["process", "continuous", "team", "incremental", "culture"] },
    { slug: "value-stream-mapping", name: "Value Stream Mapping", bestFor: "Visualizing end-to-end process flow to identify waste and improvement opportunities.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 3, pMax: 10, tags: ["process", "visual", "lean", "flow", "waste"] },
    { slug: "theory-of-constraints", name: "Theory of Constraints", bestFor: "Identifying and managing the bottleneck that limits system throughput.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 2, pMax: 8, tags: ["process", "bottleneck", "throughput", "systems", "goldratt"] },
    { slug: "business-process-reengineering", name: "Business Process Reengineering", bestFor: "Radical redesign of core processes for dramatic improvement.", complexity: "high" as const, timeframe: "long" as const, pMin: 5, pMax: 15, tags: ["process", "radical", "redesign", "transformation", "strategic"] },
    { slug: "five-s", name: "5S Methodology", bestFor: "Workplace organization: Sort, Set in order, Shine, Standardize, Sustain.", complexity: "low" as const, timeframe: "short" as const, pMin: 3, pMax: 20, tags: ["process", "workplace", "organization", "lean", "visual"] },
    { slug: "poka-yoke", name: "Poka-Yoke", bestFor: "Designing mistake-proof processes and systems.", complexity: "low" as const, timeframe: "short" as const, pMin: 1, pMax: 5, tags: ["process", "error-proof", "quality", "design", "prevention"] },
    { slug: "standard-work", name: "Standard Work", bestFor: "Documenting the current best practice as the baseline for improvement.", complexity: "low" as const, timeframe: "medium" as const, pMin: 2, pMax: 8, tags: ["process", "documentation", "baseline", "lean", "consistency"] },
    { slug: "gemba-walk", name: "Gemba Walk", bestFor: "Going to where work happens to observe and understand the real process.", complexity: "low" as const, timeframe: "short" as const, pMin: 1, pMax: 4, tags: ["process", "observation", "lean", "leadership", "understanding"] },
  ].map(m => _makeMethod(m, "process-improvement", { dimension: "optimization_need", weight: 2.0, min: 3, max: 5 }, { dimension: "process_maturity", weight: 1.5, min: 2, max: 5 })),

  // Category 5: Strategic Planning
  ...[
    { slug: "swot-analysis", name: "SWOT Analysis", bestFor: "Quick strategic assessment of Strengths, Weaknesses, Opportunities, Threats.", complexity: "low" as const, timeframe: "short" as const, pMin: 2, pMax: 15, tags: ["strategic", "assessment", "quick", "classic", "planning"] },
    { slug: "porters-five-forces", name: "Porter's Five Forces", bestFor: "Analyzing industry competitive dynamics and profitability potential.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 2, pMax: 8, tags: ["strategic", "competition", "industry", "porter", "market"] },
    { slug: "blue-ocean-strategy", name: "Blue Ocean Strategy", bestFor: "Creating uncontested market space rather than competing in existing markets.", complexity: "high" as const, timeframe: "long" as const, pMin: 3, pMax: 10, tags: ["strategic", "innovation", "market", "differentiation", "value"] },
    { slug: "scenario-planning", name: "Scenario Planning", bestFor: "Preparing for multiple plausible futures under deep uncertainty.", complexity: "high" as const, timeframe: "long" as const, pMin: 5, pMax: 15, tags: ["strategic", "futures", "uncertainty", "planning", "resilience"] },
    { slug: "pestle-analysis", name: "PESTLE Analysis", bestFor: "Scanning the macro environment: Political, Economic, Social, Technological, Legal, Environmental.", complexity: "low" as const, timeframe: "short" as const, pMin: 2, pMax: 10, tags: ["strategic", "environment", "macro", "scanning", "external"] },
    { slug: "balanced-scorecard", name: "Balanced Scorecard", bestFor: "Translating strategy into measurable objectives across four perspectives.", complexity: "high" as const, timeframe: "long" as const, pMin: 3, pMax: 12, tags: ["strategic", "measurement", "KPI", "alignment", "execution"] },
    { slug: "okrs", name: "OKRs", bestFor: "Setting and tracking ambitious Objectives with measurable Key Results.", complexity: "low" as const, timeframe: "medium" as const, pMin: 1, pMax: 20, tags: ["strategic", "goals", "alignment", "tracking", "agile"] },
    { slug: "strategy-canvas", name: "Strategy Canvas", bestFor: "Visualizing how your value proposition compares to competitors across key factors.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 2, pMax: 8, tags: ["strategic", "visual", "comparison", "value", "blue-ocean"] },
    { slug: "ansoff-matrix", name: "Ansoff Matrix", bestFor: "Evaluating growth strategies: market penetration, development, product development, diversification.", complexity: "low" as const, timeframe: "short" as const, pMin: 2, pMax: 8, tags: ["strategic", "growth", "market", "product", "framework"] },
    { slug: "bcg-matrix", name: "BCG Matrix", bestFor: "Portfolio analysis: classifying business units as Stars, Cash Cows, Question Marks, or Dogs.", complexity: "low" as const, timeframe: "short" as const, pMin: 2, pMax: 8, tags: ["strategic", "portfolio", "growth", "market-share", "allocation"] },
  ].map(m => _makeMethod(m, "strategic-planning", { dimension: "uncertainty_level", weight: 1.5, min: 3, max: 5 }, { dimension: "decision_making_need", weight: 1.5, min: 3, max: 5 })),

  // Category 6: Design & Innovation
  ...[
    { slug: "design-thinking", name: "Design Thinking", bestFor: "Human-centered innovation: Empathize, Define, Ideate, Prototype, Test.", complexity: "medium" as const, timeframe: "long" as const, pMin: 3, pMax: 12, tags: ["design", "human-centered", "empathy", "prototype", "innovation"] },
    { slug: "human-centered-design", name: "Human-Centered Design", bestFor: "Deep user research to design solutions that truly meet user needs.", complexity: "medium" as const, timeframe: "long" as const, pMin: 3, pMax: 10, tags: ["design", "user-research", "empathy", "needs", "ethnography"] },
    { slug: "rapid-prototyping", name: "Rapid Prototyping", bestFor: "Quickly building testable representations of ideas to learn fast.", complexity: "low" as const, timeframe: "short" as const, pMin: 1, pMax: 5, tags: ["design", "prototype", "fast", "testing", "iterative"] },
    { slug: "jobs-to-be-done", name: "Jobs-to-be-Done", bestFor: "Understanding what 'job' customers are hiring your product/service to do.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 2, pMax: 6, tags: ["design", "customer", "needs", "innovation", "marketing"] },
    { slug: "service-blueprint", name: "Service Blueprint", bestFor: "Mapping the entire service delivery system including front-stage and back-stage.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 3, pMax: 10, tags: ["design", "service", "mapping", "operations", "experience"] },
    { slug: "customer-journey-mapping", name: "Customer Journey Mapping", bestFor: "Visualizing the complete customer experience across all touchpoints.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 3, pMax: 10, tags: ["design", "customer", "experience", "touchpoints", "empathy"] },
    { slug: "empathy-mapping", name: "Empathy Mapping", bestFor: "Understanding users' thoughts, feelings, actions, and pain points.", complexity: "low" as const, timeframe: "short" as const, pMin: 2, pMax: 8, tags: ["design", "empathy", "user", "quick", "research"] },
    { slug: "storyboarding", name: "Storyboarding", bestFor: "Visualizing a user's experience through sequential illustrated scenes.", complexity: "low" as const, timeframe: "short" as const, pMin: 1, pMax: 6, tags: ["design", "visual", "narrative", "UX", "communication"] },
    { slug: "concept-testing", name: "Concept Testing", bestFor: "Validating ideas with target users before full development.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 2, pMax: 8, tags: ["design", "validation", "user-testing", "feedback", "lean"] },
    { slug: "minimum-viable-product", name: "Minimum Viable Product", bestFor: "Building the smallest version that delivers value and enables learning.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 2, pMax: 8, tags: ["design", "lean", "startup", "learning", "iterative"] },
  ].map(m => _makeMethod(m, "design-innovation", { dimension: "innovation_need", weight: 2.0, min: 3, max: 5 }, { dimension: "collaboration_intensity", weight: 1.3, min: 2, max: 5 })),

  // Category 7: Data & Analytics
  ...[
    { slug: "statistical-process-control", name: "Statistical Process Control", bestFor: "Monitoring process stability using control charts to detect special-cause variation.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 1, pMax: 5, tags: ["data", "quality", "control-chart", "variation", "monitoring"] },
    { slug: "regression-analysis", name: "Regression Analysis", bestFor: "Modeling relationships between variables to predict outcomes.", complexity: "high" as const, timeframe: "medium" as const, pMin: 1, pMax: 4, tags: ["data", "statistics", "prediction", "modeling", "quantitative"] },
    { slug: "monte-carlo-simulation", name: "Monte Carlo Simulation", bestFor: "Modeling uncertainty by running thousands of random scenarios.", complexity: "high" as const, timeframe: "medium" as const, pMin: 1, pMax: 4, tags: ["data", "simulation", "risk", "probability", "forecasting"] },
    { slug: "hypothesis-testing", name: "Hypothesis Testing", bestFor: "Statistically verifying whether an observed effect is real or due to chance.", complexity: "medium" as const, timeframe: "short" as const, pMin: 1, pMax: 4, tags: ["data", "statistics", "verification", "scientific", "evidence"] },
    { slug: "control-charts", name: "Control Charts", bestFor: "Distinguishing common-cause from special-cause variation over time.", complexity: "medium" as const, timeframe: "short" as const, pMin: 1, pMax: 3, tags: ["data", "quality", "variation", "time-series", "monitoring"] },
    { slug: "correlation-analysis", name: "Correlation Analysis", bestFor: "Measuring the strength and direction of relationships between variables.", complexity: "low" as const, timeframe: "short" as const, pMin: 1, pMax: 3, tags: ["data", "statistics", "relationship", "quick", "exploratory"] },
    { slug: "time-series-analysis", name: "Time Series Analysis", bestFor: "Analyzing and forecasting data points collected over time.", complexity: "high" as const, timeframe: "medium" as const, pMin: 1, pMax: 4, tags: ["data", "forecasting", "trends", "patterns", "temporal"] },
    { slug: "ab-testing", name: "A/B Testing", bestFor: "Comparing two versions to determine which performs better with real users.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 2, pMax: 6, tags: ["data", "experimentation", "comparison", "digital", "optimization"] },
    { slug: "bayesian-analysis", name: "Bayesian Analysis", bestFor: "Updating probability estimates as new evidence becomes available.", complexity: "high" as const, timeframe: "medium" as const, pMin: 1, pMax: 4, tags: ["data", "probability", "updating", "evidence", "inference"] },
    { slug: "failure-mode-effects", name: "Failure Mode and Effects Analysis", bestFor: "Systematically identifying potential failures and their impacts before they occur.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 3, pMax: 10, tags: ["data", "risk", "prevention", "quality", "reliability"] },
  ].map(m => _makeMethod(m, "data-analytics", { dimension: "data_availability", weight: 2.0, min: 3, max: 5 }, { dimension: "optimization_need", weight: 1.3, min: 2, max: 5 })),

  // Category 8: Systems Thinking
  ...[
    { slug: "causal-loop-diagram", name: "Causal Loop Diagram", bestFor: "Mapping feedback loops and dynamic relationships in complex systems.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 2, pMax: 8, tags: ["systems", "feedback", "dynamics", "visual", "complexity"] },
    { slug: "systems-dynamics", name: "Systems Dynamics", bestFor: "Modeling and simulating system behavior over time using stocks and flows.", complexity: "high" as const, timeframe: "long" as const, pMin: 2, pMax: 6, tags: ["systems", "simulation", "modeling", "stocks-flows", "complex"] },
    { slug: "cynefin-framework", name: "Cynefin Framework", bestFor: "Categorizing problems as Simple, Complicated, Complex, or Chaotic to choose the right approach.", complexity: "low" as const, timeframe: "short" as const, pMin: 2, pMax: 10, tags: ["systems", "sense-making", "complexity", "leadership", "triage"] },
    { slug: "soft-systems-methodology", name: "Soft Systems Methodology", bestFor: "Structuring messy, ill-defined problems involving human activity systems.", complexity: "high" as const, timeframe: "long" as const, pMin: 3, pMax: 10, tags: ["systems", "messy-problems", "stakeholders", "worldviews", "academic"] },
    { slug: "viable-system-model", name: "Viable System Model", bestFor: "Diagnosing organizational structure using cybernetic principles.", complexity: "high" as const, timeframe: "long" as const, pMin: 2, pMax: 8, tags: ["systems", "organization", "cybernetics", "viability", "structure"] },
    { slug: "stock-flow-diagrams", name: "Stock & Flow Diagrams", bestFor: "Modeling accumulations and rates of change in systems.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 1, pMax: 5, tags: ["systems", "modeling", "accumulation", "rates", "visual"] },
    { slug: "leverage-points", name: "Leverage Points", bestFor: "Identifying the most effective intervention points in a system (Donella Meadows).", complexity: "medium" as const, timeframe: "medium" as const, pMin: 2, pMax: 8, tags: ["systems", "intervention", "effectiveness", "strategy", "meadows"] },
    { slug: "system-archetypes", name: "System Archetypes", bestFor: "Recognizing common systemic patterns like 'Fixes that Fail' or 'Tragedy of the Commons'.", complexity: "medium" as const, timeframe: "short" as const, pMin: 2, pMax: 8, tags: ["systems", "patterns", "archetype", "senge", "learning"] },
    { slug: "rich-pictures", name: "Rich Pictures", bestFor: "Creating informal visual representations of complex situations including stakeholders and concerns.", complexity: "low" as const, timeframe: "short" as const, pMin: 2, pMax: 8, tags: ["systems", "visual", "informal", "stakeholders", "exploration"] },
    { slug: "stakeholder-mapping", name: "Stakeholder Mapping", bestFor: "Identifying and analyzing stakeholder interests, influence, and relationships.", complexity: "low" as const, timeframe: "short" as const, pMin: 2, pMax: 8, tags: ["systems", "stakeholders", "influence", "analysis", "governance"] },
  ].map(m => _makeMethod(m, "systems-thinking", { dimension: "complexity", weight: 2.0, min: 3, max: 5 }, { dimension: "uncertainty_level", weight: 1.5, min: 3, max: 5 })),

  // Category 9: Agile & Iterative
  ...[
    { slug: "pdca", name: "PDCA Cycle", bestFor: "Plan-Do-Check-Act iterative improvement cycle for any process.", complexity: "low" as const, timeframe: "short" as const, pMin: 1, pMax: 8, tags: ["agile", "iterative", "deming", "continuous", "cycle"] },
    { slug: "a3-thinking", name: "A3 Thinking", bestFor: "Structured problem solving on a single A3 page: problem, analysis, proposal, plan.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 1, pMax: 5, tags: ["agile", "lean", "structured", "concise", "toyota"] },
    { slug: "after-action-review", name: "After Action Review", bestFor: "Learning from completed actions: what was supposed to happen, what did, why, what to improve.", complexity: "low" as const, timeframe: "short" as const, pMin: 3, pMax: 15, tags: ["agile", "learning", "retrospective", "military", "team"] },
    { slug: "sprint-retrospective", name: "Sprint Retrospective", bestFor: "Team reflection at the end of an agile sprint: what went well, what to improve.", complexity: "low" as const, timeframe: "short" as const, pMin: 3, pMax: 10, tags: ["agile", "scrum", "team", "improvement", "iterative"] },
    { slug: "rapid-improvement-event", name: "Rapid Improvement Event", bestFor: "Intensive 3-5 day workshop to dramatically improve a specific process.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 5, pMax: 15, tags: ["agile", "kaizen", "intensive", "workshop", "focused"] },
    { slug: "eight-d", name: "8D Problem Solving", bestFor: "Eight-discipline team approach for product and process problems.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 3, pMax: 10, tags: ["agile", "automotive", "team", "structured", "quality"] },
    { slug: "ooda-loop", name: "OODA Loop", bestFor: "Observe-Orient-Decide-Act rapid decision cycle for dynamic environments.", complexity: "low" as const, timeframe: "short" as const, pMin: 1, pMax: 5, tags: ["agile", "military", "rapid", "adaptive", "decision"] },
    { slug: "kata-improvement", name: "Toyota Kata", bestFor: "Scientific thinking routine: understand direction, grasp current condition, establish next target, experiment.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 2, pMax: 5, tags: ["agile", "scientific", "toyota", "coaching", "habits"] },
    { slug: "experiment-driven", name: "Experiment-Driven Development", bestFor: "Testing hypotheses through controlled experiments to validate solutions.", complexity: "medium" as const, timeframe: "short" as const, pMin: 2, pMax: 8, tags: ["agile", "scientific", "validation", "lean", "learning"] },
    { slug: "iterative-refinement", name: "Iterative Refinement", bestFor: "Progressively improving a solution through repeated cycles of feedback and adjustment.", complexity: "low" as const, timeframe: "medium" as const, pMin: 1, pMax: 8, tags: ["agile", "iterative", "incremental", "feedback", "improvement"] },
  ].map(m => _makeMethod(m, "agile-iterative", { dimension: "urgency", weight: 1.5, min: 2, max: 5 }, { dimension: "collaboration_intensity", weight: 1.3, min: 2, max: 5 })),

  // Category 10: Collaboration & Facilitation
  ...[
    { slug: "world-cafe", name: "World Café", bestFor: "Large-group conversational process for exploring questions that matter.", complexity: "low" as const, timeframe: "medium" as const, pMin: 12, pMax: 100, tags: ["collaboration", "large-group", "conversation", "emergence", "engagement"] },
    { slug: "open-space-technology", name: "Open Space Technology", bestFor: "Self-organizing conference format where participants create their own agenda.", complexity: "low" as const, timeframe: "medium" as const, pMin: 15, pMax: 200, tags: ["collaboration", "self-organizing", "large-group", "emergence", "passion"] },
    { slug: "nominal-group-technique", name: "Nominal Group Technique", bestFor: "Structured voting to prioritize ideas while minimizing groupthink.", complexity: "low" as const, timeframe: "short" as const, pMin: 5, pMax: 12, tags: ["collaboration", "voting", "prioritization", "structured", "fair"] },
    { slug: "fishbowl-discussion", name: "Fishbowl Discussion", bestFor: "Inner circle discusses while outer circle observes, then rotates.", complexity: "low" as const, timeframe: "short" as const, pMin: 8, pMax: 30, tags: ["collaboration", "discussion", "listening", "democratic", "perspectives"] },
    { slug: "appreciative-inquiry", name: "Appreciative Inquiry", bestFor: "Strengths-based change approach: Discover what works, Dream what could be, Design how, Deliver.", complexity: "medium" as const, timeframe: "long" as const, pMin: 5, pMax: 50, tags: ["collaboration", "positive", "strengths", "change", "organizational"] },
    { slug: "future-search", name: "Future Search", bestFor: "Bringing the whole system into the room to plan a shared future.", complexity: "medium" as const, timeframe: "long" as const, pMin: 30, pMax: 80, tags: ["collaboration", "large-group", "future", "consensus", "whole-system"] },
    { slug: "six-thinking-hats", name: "Six Thinking Hats", bestFor: "Parallel thinking technique: group wears same 'hat' at same time for focused exploration.", complexity: "low" as const, timeframe: "short" as const, pMin: 3, pMax: 12, tags: ["collaboration", "de-bono", "parallel", "structured", "perspectives"] },
    { slug: "dot-voting", name: "Dot Voting", bestFor: "Quick democratic prioritization using limited votes (dots) across options.", complexity: "low" as const, timeframe: "short" as const, pMin: 3, pMax: 30, tags: ["collaboration", "voting", "quick", "democratic", "prioritization"] },
    { slug: "liberating-structures", name: "Liberating Structures", bestFor: "Collection of 33 microstructures for inclusive, engaging group work.", complexity: "low" as const, timeframe: "short" as const, pMin: 5, pMax: 50, tags: ["collaboration", "facilitation", "inclusive", "engagement", "versatile"] },
    { slug: "consensus-workshop", name: "Consensus Workshop", bestFor: "ICA method for building group consensus through individual→cluster→resolve process.", complexity: "medium" as const, timeframe: "medium" as const, pMin: 5, pMax: 25, tags: ["collaboration", "consensus", "structured", "inclusive", "decision"] },
  ].map(m => _makeMethod(m, "collaboration-facilitation", { dimension: "collaboration_intensity", weight: 2.0, min: 3, max: 5 }, { dimension: "stakeholder_count", weight: 1.8, min: 3, max: 5 })),
];

// ── Helper for abbreviated methods ──────────────────────────────────────────

function _makeMethod(
  m: { slug: string; name: string; bestFor: string; complexity: "low" | "medium" | "high"; timeframe: "short" | "medium" | "long"; pMin: number; pMax: number; tags: string[] },
  categorySlug: string,
  fitRule1: { dimension: string; weight: number; min: number; max: number },
  fitRule2: { dimension: string; weight: number; min: number; max: number },
): MethodDef {
  return {
    slug: m.slug,
    name: m.name,
    categorySlug,
    description: m.bestFor,
    summary: m.bestFor,
    complexity: m.complexity,
    timeframe: m.timeframe,
    participantsMin: m.pMin,
    participantsMax: m.pMax,
    bestFor: m.bestFor,
    tools: "Whiteboard, facilitation materials, relevant templates.",
    example: `Applied ${m.name} to improve team performance and outcomes.`,
    aliases: [],
    tags: m.tags,
    relatedSlugs: [],
    workflow: {
      title: `${m.name} Process`,
      description: `Execute ${m.name} methodology.`,
      steps: [
        { title: "Preparation", description: `Gather team, define scope, prepare materials for ${m.name}.`, durationMinutes: 15, deliverable: "Prepared session" },
        { title: "Execution", description: `Apply the ${m.name} methodology to the problem at hand.`, durationMinutes: 45, deliverable: "Analysis/output" },
        { title: "Review Results", description: "Review findings, identify key insights and action items.", durationMinutes: 15, deliverable: "Insights and actions" },
        { title: "Action Planning", description: "Define next steps, assign owners, set deadlines.", durationMinutes: 15, deliverable: "Action plan" },
      ],
    },
    fitRules: [fitRule1, fitRule2],
  };
}
