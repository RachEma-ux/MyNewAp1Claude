/**
 * PM Methods Catalog — Governed Methodology Registry
 *
 * 8 categories, 35+ methods. Each method defines:
 *   - id: unique slug
 *   - name: display name
 *   - category: parent category id
 *   - philosophy: short categorization tag
 *   - description: 1–2 sentence overview
 *   - strengths: key advantages
 *   - bestFor: when to use this method
 *   - governanceCompatibility: how it maps to governance gates
 *   - deliveryApproach: "predictive" | "agile" | "hybrid" (maps to wizard)
 *   - origin: standard body or source
 */

// ── Category definition ─────────────────────────────────────────────────────

export interface MethodCategory {
  id: string;
  label: string;
  shortLabel: string;
  color: string;      // tailwind bg color token
  philosophy: string;  // one-line summary
  icon: string;        // lucide icon name
}

export const METHOD_CATEGORIES: MethodCategory[] = [
  {
    id: "predictive",
    label: "Predictive (Traditional)",
    shortLabel: "Predictive",
    color: "bg-blue-500",
    philosophy: "Plan first, execute sequentially",
    icon: "Blocks",
  },
  {
    id: "agile",
    label: "Agile (Adaptive)",
    shortLabel: "Agile",
    color: "bg-green-500",
    philosophy: "Adapt continuously through iterations",
    icon: "Zap",
  },
  {
    id: "hybrid",
    label: "Hybrid",
    shortLabel: "Hybrid",
    color: "bg-yellow-500",
    philosophy: "Mix planning + adaptation",
    icon: "Merge",
  },
  {
    id: "process",
    label: "Process & Optimization",
    shortLabel: "Process",
    color: "bg-purple-500",
    philosophy: "Optimize flow & reduce waste",
    icon: "Settings",
  },
  {
    id: "product",
    label: "Product & Innovation",
    shortLabel: "Product",
    color: "bg-orange-500",
    philosophy: "Risk-driven, prototype-centric development",
    icon: "Lightbulb",
  },
  {
    id: "it-delivery",
    label: "IT & Continuous Delivery",
    shortLabel: "IT/CD",
    color: "bg-cyan-500",
    philosophy: "Continuous integration & deployment",
    icon: "Server",
  },
  {
    id: "governance",
    label: "Portfolio & Program Governance",
    shortLabel: "Governance",
    color: "bg-red-500",
    philosophy: "Oversight at portfolio/program level",
    icon: "Shield",
  },
  {
    id: "emerging",
    label: "Emerging / Modern",
    shortLabel: "Emerging",
    color: "bg-indigo-500",
    philosophy: "Next-generation project approaches",
    icon: "Sparkles",
  },
];

// ── Method definition ───────────────────────────────────────────────────────

export interface MethodDefinition {
  id: string;
  name: string;
  categoryId: string;
  description: string;
  philosophy: string;
  strengths: string[];
  bestFor: string[];
  governanceCompatibility: "full" | "partial" | "minimal";
  deliveryApproach: "predictive" | "agile" | "hybrid";
  origin: string;
  gateModel?: string; // how gates map to this method
}

// ── 1. Predictive ───────────────────────────────────────────────────────────

const PREDICTIVE_METHODS: MethodDefinition[] = [
  {
    id: "waterfall",
    name: "Waterfall",
    categoryId: "predictive",
    description: "Linear, sequential phases: Requirements → Design → Implementation → Testing → Deployment → Maintenance.",
    philosophy: "Plan first, execute sequentially",
    strengths: ["Clear milestones", "Easy to understand", "Well-documented handoffs"],
    bestFor: ["Construction", "Manufacturing", "Regulated environments", "Fixed-scope contracts"],
    governanceCompatibility: "full",
    deliveryApproach: "predictive",
    origin: "Winston Royce (1970)",
    gateModel: "G0 → G1 → G2 (change control) → G4 closure. Each phase has a formal gate.",
  },
  {
    id: "v-model",
    name: "V-Model",
    categoryId: "predictive",
    description: "Extension of Waterfall where each development phase has a corresponding testing phase. Verification and validation run in parallel.",
    philosophy: "Plan first, execute sequentially",
    strengths: ["Strong quality focus", "Test planning from day one", "Traceability"],
    bestFor: ["Aerospace", "Automotive", "Medical systems", "Safety-critical software"],
    governanceCompatibility: "full",
    deliveryApproach: "predictive",
    origin: "German Federal Administration (1990s)",
    gateModel: "Each V-arm crossing is a gate. Full G0–G4 alignment.",
  },
  {
    id: "cpm",
    name: "Critical Path Method (CPM)",
    categoryId: "predictive",
    description: "Focuses on identifying the longest chain of dependent tasks to determine minimum project duration.",
    philosophy: "Plan first, execute sequentially",
    strengths: ["Identifies bottlenecks", "Optimizes scheduling", "Resource leveling"],
    bestFor: ["Infrastructure projects", "Construction", "Event planning"],
    governanceCompatibility: "full",
    deliveryApproach: "predictive",
    origin: "DuPont (1957)",
    gateModel: "Gates at critical path milestones.",
  },
  {
    id: "pert",
    name: "PERT (Program Evaluation and Review Technique)",
    categoryId: "predictive",
    description: "Uses probabilistic time estimates (optimistic, most likely, pessimistic) for task scheduling under uncertainty.",
    philosophy: "Plan first, execute sequentially",
    strengths: ["Handles uncertainty", "Statistical schedule confidence", "Three-point estimating"],
    bestFor: ["R&D projects", "First-of-a-kind deliveries", "High-uncertainty programs"],
    governanceCompatibility: "full",
    deliveryApproach: "predictive",
    origin: "US Navy / Booz Allen Hamilton (1958)",
    gateModel: "Gates at milestone events in the PERT network.",
  },
  {
    id: "prince2",
    name: "PRINCE2",
    categoryId: "predictive",
    description: "Structured, process-driven framework with defined roles, stages, and management products. Widely used in UK/Europe.",
    philosophy: "Plan first, execute sequentially",
    strengths: ["Strong governance", "Defined escalation", "Stage-gate built in", "Role clarity"],
    bestFor: ["Government projects", "EU-funded programs", "Regulated industries"],
    governanceCompatibility: "full",
    deliveryApproach: "predictive",
    origin: "UK Office of Government Commerce (OGC)",
    gateModel: "Built-in stage gates. Maps 1:1 to G0–G4 model.",
  },
  {
    id: "pmbok",
    name: "PMBOK-Based Project Management",
    categoryId: "predictive",
    description: "Standards-based approach from PMI defining 10 knowledge areas and 5 process groups. Framework, not prescriptive lifecycle.",
    philosophy: "Plan first, execute sequentially",
    strengths: ["Comprehensive knowledge base", "PMP certification standard", "Flexible application"],
    bestFor: ["Cross-industry", "Organizations needing PMI compliance", "Portfolio standardization"],
    governanceCompatibility: "full",
    deliveryApproach: "predictive",
    origin: "Project Management Institute (PMI)",
    gateModel: "Process group transitions serve as natural gates. Full G0–G4 alignment via PMBOK 7th edition.",
  },
];

// ── 2. Agile ────────────────────────────────────────────────────────────────

const AGILE_METHODS: MethodDefinition[] = [
  {
    id: "scrum",
    name: "Scrum",
    categoryId: "agile",
    description: "Time-boxed sprints (1–4 weeks) with defined roles: Product Owner, Scrum Master, Development Team. Inspect & adapt cadence.",
    philosophy: "Adapt continuously through iterations",
    strengths: ["Fast feedback", "Team empowerment", "Predictable delivery cadence"],
    bestFor: ["Software development", "Product teams", "Cross-functional teams"],
    governanceCompatibility: "partial",
    deliveryApproach: "agile",
    origin: "Ken Schwaber & Jeff Sutherland (1995)",
    gateModel: "Sprint Reviews as lightweight gates. G0 at product vision, G1 at initial backlog, G4 at release.",
  },
  {
    id: "kanban",
    name: "Kanban",
    categoryId: "agile",
    description: "Visual workflow management with WIP (Work in Progress) limits. Pull-based, continuous flow.",
    philosophy: "Adapt continuously through iterations",
    strengths: ["Visualizes bottlenecks", "No batch overhead", "Continuous delivery"],
    bestFor: ["Support teams", "Operations", "Maintenance", "Continuous improvement"],
    governanceCompatibility: "minimal",
    deliveryApproach: "agile",
    origin: "Toyota Production System / David Anderson",
    gateModel: "Flow-based; gates trigger on cumulative flow thresholds or service classes.",
  },
  {
    id: "xp",
    name: "Extreme Programming (XP)",
    categoryId: "agile",
    description: "Engineering-heavy agile method emphasizing TDD, pair programming, continuous integration, and frequent releases.",
    philosophy: "Adapt continuously through iterations",
    strengths: ["High code quality", "Fast feedback", "Technical excellence"],
    bestFor: ["Software teams prioritizing quality", "Evolving requirements", "Small teams"],
    governanceCompatibility: "partial",
    deliveryApproach: "agile",
    origin: "Kent Beck (1996)",
    gateModel: "Release planning as G1. Continuous integration as ongoing G3 compliance.",
  },
  {
    id: "lean-pm",
    name: "Lean Project Management",
    categoryId: "agile",
    description: "Focus on waste reduction, flow efficiency, and value stream mapping. Eliminate non-value-adding activities.",
    philosophy: "Optimize flow & reduce waste",
    strengths: ["Waste elimination", "Value focus", "Process efficiency"],
    bestFor: ["Manufacturing", "Operations optimization", "Process improvement"],
    governanceCompatibility: "partial",
    deliveryApproach: "agile",
    origin: "Toyota Production System / Womack & Jones",
    gateModel: "Value stream milestones as gates. G3 via continuous waste audits.",
  },
  {
    id: "crystal",
    name: "Crystal",
    categoryId: "agile",
    description: "People-centric, adaptable framework with variants by team size (Crystal Clear, Yellow, Orange, Red).",
    philosophy: "Adapt continuously through iterations",
    strengths: ["Adaptable to team size", "People-first", "Communication focus"],
    bestFor: ["Teams of varying sizes", "Projects needing flexibility", "Human-centric orgs"],
    governanceCompatibility: "minimal",
    deliveryApproach: "agile",
    origin: "Alistair Cockburn",
    gateModel: "Lightweight reflection points. Gates at delivery increments.",
  },
  {
    id: "dsdm",
    name: "DSDM (Dynamic Systems Development Method)",
    categoryId: "agile",
    description: "Structured agile framework with governance built in. MoSCoW prioritization, timeboxed iterations.",
    philosophy: "Adapt continuously through iterations",
    strengths: ["Agile with governance", "MoSCoW prioritization", "Fixed time/cost, flexible scope"],
    bestFor: ["Enterprise agile", "Regulated environments needing agility", "Fixed-budget projects"],
    governanceCompatibility: "full",
    deliveryApproach: "agile",
    origin: "DSDM Consortium (1994)",
    gateModel: "Built-in phase gates (Feasibility, Foundations, Exploration, Engineering, Deployment).",
  },
  {
    id: "fdd",
    name: "Feature-Driven Development (FDD)",
    categoryId: "agile",
    description: "Organized around building features incrementally. Model → Feature List → Plan → Design → Build per feature.",
    philosophy: "Adapt continuously through iterations",
    strengths: ["Feature-centric planning", "Scalable", "Progress tracking by feature"],
    bestFor: ["Large codebases", "Feature-rich products", "Teams needing visible progress"],
    governanceCompatibility: "partial",
    deliveryApproach: "agile",
    origin: "Jeff De Luca & Peter Coad (1999)",
    gateModel: "Feature completion milestones as gates.",
  },
  {
    id: "apf",
    name: "Adaptive Project Framework (APF)",
    categoryId: "agile",
    description: "Focuses on learning and adaptation during execution. Scope is adjusted based on what is learned each cycle.",
    philosophy: "Adapt continuously through iterations",
    strengths: ["Embraces uncertainty", "Learning-driven", "Client collaboration"],
    bestFor: ["Exploratory projects", "Innovation", "Unknown-scope work"],
    governanceCompatibility: "minimal",
    deliveryApproach: "agile",
    origin: "Robert K. Wysocki",
    gateModel: "Cycle-end reviews as gates. G0 at project initiation, G4 at final delivery.",
  },
];

// ── 3. Hybrid ───────────────────────────────────────────────────────────────

const HYBRID_METHODS: MethodDefinition[] = [
  {
    id: "agile-waterfall",
    name: "Agile-Waterfall Hybrid",
    categoryId: "hybrid",
    description: "Predictive planning phases combined with agile iterative delivery. Requirements and design upfront, agile execution.",
    philosophy: "Mix planning + adaptation",
    strengths: ["Structured start, flexible execution", "Satisfies governance + agility"],
    bestFor: ["Enterprise transformations", "Projects with fixed scope but flexible delivery"],
    governanceCompatibility: "full",
    deliveryApproach: "hybrid",
    origin: "Industry practice",
    gateModel: "G0/G1 as predictive gates. Execution uses sprint reviews. G4 at closure.",
  },
  {
    id: "safe",
    name: "SAFe (Scaled Agile Framework)",
    categoryId: "hybrid",
    description: "Enterprise-level agile scaling framework. Aligns strategy, execution, and governance across teams, programs, and portfolios.",
    philosophy: "Mix planning + adaptation",
    strengths: ["Enterprise scaling", "Portfolio alignment", "PI Planning events"],
    bestFor: ["Large organizations", "Multi-team programs", "Portfolio-level agile"],
    governanceCompatibility: "full",
    deliveryApproach: "hybrid",
    origin: "Scaled Agile Inc. / Dean Leffingwell",
    gateModel: "PI boundaries as program gates. Portfolio Kanban for strategic gating.",
  },
  {
    id: "less",
    name: "LeSS (Large Scale Scrum)",
    categoryId: "hybrid",
    description: "Simplified scaling of Scrum to multiple teams working on a single product. Minimal additional process.",
    philosophy: "Mix planning + adaptation",
    strengths: ["Simplicity at scale", "Single product backlog", "Cross-team coordination"],
    bestFor: ["2–8 teams on one product", "Organizations wanting minimal scaling overhead"],
    governanceCompatibility: "partial",
    deliveryApproach: "hybrid",
    origin: "Craig Larman & Bas Vodde",
    gateModel: "Sprint Reviews as gates. Overall Sprint Review for product-level gating.",
  },
  {
    id: "da",
    name: "Disciplined Agile (DA)",
    categoryId: "hybrid",
    description: "Toolkit approach providing a decision framework for choosing the right practices. Formerly Disciplined Agile Delivery.",
    philosophy: "Mix planning + adaptation",
    strengths: ["Context-sensitive guidance", "Process goal-driven", "Wide practice library"],
    bestFor: ["Organizations needing tailored agile", "PMI-aligned enterprises"],
    governanceCompatibility: "full",
    deliveryApproach: "hybrid",
    origin: "Scott Ambler / PMI",
    gateModel: "Lifecycle milestones as gates. Full governance integration via DA FLEX.",
  },
  {
    id: "nexus",
    name: "Nexus",
    categoryId: "hybrid",
    description: "Scrum scaling framework for 3–9 Scrum teams. Adds Nexus Integration Team and cross-team coordination events.",
    philosophy: "Mix planning + adaptation",
    strengths: ["Lightweight scaling", "Scrum-native", "Integration focus"],
    bestFor: ["3–9 Scrum teams", "Product development at scale"],
    governanceCompatibility: "partial",
    deliveryApproach: "hybrid",
    origin: "Ken Schwaber / Scrum.org",
    gateModel: "Nexus Sprint Reviews as integration gates.",
  },
  {
    id: "scrumban",
    name: "Scrumban",
    categoryId: "hybrid",
    description: "Combination of Scrum's structure (sprints, roles) with Kanban's flow management (WIP limits, pull-based).",
    philosophy: "Mix planning + adaptation",
    strengths: ["Best of both worlds", "Flexible cadence", "Visual flow management"],
    bestFor: ["Transitioning from Scrum to Kanban", "Maintenance + feature work", "Support teams"],
    governanceCompatibility: "partial",
    deliveryApproach: "hybrid",
    origin: "Corey Ladas (2009)",
    gateModel: "Sprint boundaries optional. Flow-based gates via cumulative flow metrics.",
  },
];

// ── 4. Process & Optimization ───────────────────────────────────────────────

const PROCESS_METHODS: MethodDefinition[] = [
  {
    id: "six-sigma",
    name: "Six Sigma",
    categoryId: "process",
    description: "Data-driven quality improvement methodology using DMAIC (Define, Measure, Analyze, Improve, Control) cycle.",
    philosophy: "Optimize flow & reduce waste",
    strengths: ["Statistical rigor", "Defect reduction", "Process capability"],
    bestFor: ["Quality improvement", "Manufacturing", "Process optimization"],
    governanceCompatibility: "full",
    deliveryApproach: "predictive",
    origin: "Motorola / Bill Smith (1986)",
    gateModel: "DMAIC phases have built-in tollgates. Maps to G0–G4.",
  },
  {
    id: "lean-six-sigma",
    name: "Lean Six Sigma",
    categoryId: "process",
    description: "Combination of Lean (waste reduction) and Six Sigma (defect reduction). Speed + quality.",
    philosophy: "Optimize flow & reduce waste",
    strengths: ["Waste + defect reduction", "Value stream focus", "Belt certification system"],
    bestFor: ["Operations excellence", "Healthcare", "Financial services"],
    governanceCompatibility: "full",
    deliveryApproach: "predictive",
    origin: "Industry convergence (2000s)",
    gateModel: "DMAIC tollgates with Lean value stream checkpoints.",
  },
  {
    id: "toc",
    name: "Theory of Constraints (TOC)",
    categoryId: "process",
    description: "Focus on identifying and managing the system's constraint (bottleneck). Exploit → subordinate → elevate cycle.",
    philosophy: "Optimize flow & reduce waste",
    strengths: ["Bottleneck focus", "System thinking", "Throughput optimization"],
    bestFor: ["Manufacturing", "Supply chain", "Project scheduling (Critical Chain)"],
    governanceCompatibility: "partial",
    deliveryApproach: "predictive",
    origin: "Eliyahu Goldratt (1984)",
    gateModel: "Buffer management triggers as gates. Critical Chain milestones.",
  },
];

// ── 5. Product & Innovation ─────────────────────────────────────────────────

const PRODUCT_METHODS: MethodDefinition[] = [
  {
    id: "stage-gate",
    name: "Stage-Gate (Phase-Gate)",
    categoryId: "product",
    description: "Product development framework with defined stages separated by management gates. Go/Kill/Hold/Recycle decisions.",
    philosophy: "Risk-driven, prototype-centric development",
    strengths: ["Clear decision points", "Portfolio management", "Risk reduction"],
    bestFor: ["New product development", "R&D", "Innovation pipelines"],
    governanceCompatibility: "full",
    deliveryApproach: "predictive",
    origin: "Robert G. Cooper",
    gateModel: "Native gate model. G0=Scoping, G1=Business Case, G2=Development, G3=Testing, G4=Launch.",
  },
  {
    id: "spiral",
    name: "Spiral Model",
    categoryId: "product",
    description: "Risk-driven iterative model. Each spiral cycle: Planning → Risk Analysis → Engineering → Evaluation.",
    philosophy: "Risk-driven, prototype-centric development",
    strengths: ["Risk-first approach", "Iterative prototyping", "Flexible scope"],
    bestFor: ["High-risk projects", "Large-scale systems", "R&D with unknown risks"],
    governanceCompatibility: "full",
    deliveryApproach: "hybrid",
    origin: "Barry Boehm (1986)",
    gateModel: "Each spiral anchor point is a gate. Risk assessment at each cycle.",
  },
  {
    id: "rad",
    name: "Rapid Application Development (RAD)",
    categoryId: "product",
    description: "Fast prototyping-focused approach. Short development cycles with user feedback loops.",
    philosophy: "Risk-driven, prototype-centric development",
    strengths: ["Fast delivery", "User involvement", "Prototype-driven"],
    bestFor: ["UI/UX heavy projects", "Time-constrained delivery", "Proof of concepts"],
    governanceCompatibility: "minimal",
    deliveryApproach: "agile",
    origin: "James Martin (1991)",
    gateModel: "Prototype reviews as gates. Lightweight G0 and G4.",
  },
];

// ── 6. IT & Continuous Delivery ─────────────────────────────────────────────

const IT_METHODS: MethodDefinition[] = [
  {
    id: "itil",
    name: "ITIL (IT Infrastructure Library)",
    categoryId: "it-delivery",
    description: "IT service management framework defining best practices for service strategy, design, transition, operation, and improvement.",
    philosophy: "Continuous integration & deployment",
    strengths: ["Service lifecycle", "Incident/problem management", "Change management"],
    bestFor: ["IT operations", "Service providers", "ITSM transformation"],
    governanceCompatibility: "full",
    deliveryApproach: "predictive",
    origin: "UK Cabinet Office / Axelos",
    gateModel: "Service lifecycle stages as gates. Change Advisory Board as G2.",
  },
  {
    id: "devops",
    name: "DevOps",
    categoryId: "it-delivery",
    description: "Cultural and technical practice integrating development and operations. CI/CD pipelines, infrastructure as code.",
    philosophy: "Continuous integration & deployment",
    strengths: ["Fast deployment", "Automated testing", "Infrastructure automation"],
    bestFor: ["Software products", "SaaS", "Cloud-native development"],
    governanceCompatibility: "partial",
    deliveryApproach: "agile",
    origin: "Patrick Debois / Industry (2009)",
    gateModel: "Pipeline stages as automated gates. G3 via continuous monitoring.",
  },
  {
    id: "continuous-delivery",
    name: "Continuous Delivery",
    categoryId: "it-delivery",
    description: "Practice ensuring software can be released to production at any time. Automated build, test, deploy pipelines.",
    philosophy: "Continuous integration & deployment",
    strengths: ["Always releasable", "Automated quality", "Reduced risk per release"],
    bestFor: ["Web applications", "Microservices", "High-frequency release environments"],
    governanceCompatibility: "partial",
    deliveryApproach: "agile",
    origin: "Jez Humble & David Farley (2010)",
    gateModel: "Automated pipeline gates. Manual gates for compliance-sensitive releases.",
  },
];

// ── 7. Governance & Portfolio ───────────────────────────────────────────────

const GOVERNANCE_METHODS: MethodDefinition[] = [
  {
    id: "mop",
    name: "MoP (Management of Portfolios)",
    categoryId: "governance",
    description: "Framework for portfolio management: prioritization, balancing, and governance of investments across programs and projects.",
    philosophy: "Oversight at portfolio/program level",
    strengths: ["Strategic alignment", "Investment optimization", "Portfolio governance"],
    bestFor: ["Portfolio offices", "Investment decisions", "Strategic planning"],
    governanceCompatibility: "full",
    deliveryApproach: "predictive",
    origin: "Axelos",
    gateModel: "Portfolio decision gates at investment cycles. Full G0–G4 at project level.",
  },
  {
    id: "msp",
    name: "MSP (Managing Successful Programmes)",
    categoryId: "governance",
    description: "Programme management framework for coordinating related projects to deliver outcomes and benefits.",
    philosophy: "Oversight at portfolio/program level",
    strengths: ["Benefits realization", "Programme governance", "Stakeholder engagement"],
    bestFor: ["Transformation programmes", "Multi-project coordination", "Benefits-driven work"],
    governanceCompatibility: "full",
    deliveryApproach: "predictive",
    origin: "Axelos",
    gateModel: "Tranche boundaries as programme gates. Project gates nested within.",
  },
  {
    id: "pmi-portfolio",
    name: "Portfolio Management (PMI-based)",
    categoryId: "governance",
    description: "PMI's standard for portfolio management: component selection, prioritization, authorization, and oversight.",
    philosophy: "Oversight at portfolio/program level",
    strengths: ["PMI-aligned", "Component governance", "Strategic portfolio balancing"],
    bestFor: ["PMI-certified organizations", "Large portfolios", "Resource optimization"],
    governanceCompatibility: "full",
    deliveryApproach: "predictive",
    origin: "Project Management Institute (PMI)",
    gateModel: "Portfolio authorization gates. Individual project G0–G4 within portfolio.",
  },
];

// ── 8. Emerging / Modern ────────────────────────────────────────────────────

const EMERGING_METHODS: MethodDefinition[] = [
  {
    id: "agilepm",
    name: "AgilePM",
    categoryId: "emerging",
    description: "DSDM-based agile project management certification and framework. Combines agile delivery with project governance.",
    philosophy: "Next-generation project approaches",
    strengths: ["Certified framework", "Governance-friendly agile", "MoSCoW prioritization"],
    bestFor: ["Enterprise agile adoption", "Governance-sensitive environments"],
    governanceCompatibility: "full",
    deliveryApproach: "agile",
    origin: "APMG International / DSDM Consortium",
    gateModel: "Phase gates aligned to DSDM lifecycle.",
  },
  {
    id: "value-driven",
    name: "Value-Driven Delivery",
    categoryId: "emerging",
    description: "Focus on maximizing business value delivered. Prioritize by value, measure outcomes, optimize continuously.",
    philosophy: "Next-generation project approaches",
    strengths: ["Outcome focus", "Value measurement", "Continuous prioritization"],
    bestFor: ["Product management", "Digital transformation", "Agile at scale"],
    governanceCompatibility: "partial",
    deliveryApproach: "agile",
    origin: "Agile community / PMI Agile Practice Guide",
    gateModel: "Value milestones as gates. G0 at value hypothesis, G4 at benefit realization.",
  },
  {
    id: "outcome-based",
    name: "Outcome-Based Project Management",
    categoryId: "emerging",
    description: "Shift from output-based to outcome-based delivery. Success measured by achieved outcomes, not delivered features.",
    philosophy: "Next-generation project approaches",
    strengths: ["Business outcome alignment", "Flexible scope", "Impact measurement"],
    bestFor: ["Digital products", "Government projects", "Social impact programs"],
    governanceCompatibility: "partial",
    deliveryApproach: "hybrid",
    origin: "Modern PM practice",
    gateModel: "Outcome validation gates. G0 at outcome definition, G4 at impact assessment.",
  },
  {
    id: "ai-augmented",
    name: "AI-Augmented Project Management",
    categoryId: "emerging",
    description: "Leverages AI for risk prediction, resource optimization, automated reporting, and decision support.",
    philosophy: "Next-generation project approaches",
    strengths: ["Predictive analytics", "Automated insights", "Decision augmentation"],
    bestFor: ["Data-rich environments", "Complex portfolios", "Innovation teams"],
    governanceCompatibility: "full",
    deliveryApproach: "hybrid",
    origin: "Industry emerging practice",
    gateModel: "AI-scored gates. Automated G3 compliance monitoring. Predictive gate readiness.",
  },
];

// ── Combined catalog ────────────────────────────────────────────────────────

export const ALL_METHODS: MethodDefinition[] = [
  ...PREDICTIVE_METHODS,
  ...AGILE_METHODS,
  ...HYBRID_METHODS,
  ...PROCESS_METHODS,
  ...PRODUCT_METHODS,
  ...IT_METHODS,
  ...GOVERNANCE_METHODS,
  ...EMERGING_METHODS,
];

/** Get methods by category */
export function getMethodsByCategory(categoryId: string): MethodDefinition[] {
  return ALL_METHODS.filter((m) => m.categoryId === categoryId);
}

/** Get a single method by id */
export function getMethodById(id: string): MethodDefinition | undefined {
  return ALL_METHODS.find((m) => m.id === id);
}

/** Get category by id */
export function getCategoryById(id: string): MethodCategory | undefined {
  return METHOD_CATEGORIES.find((c) => c.id === id);
}

/** Map a delivery approach string to compatible methods */
export function getMethodsForApproach(approach: "predictive" | "agile" | "hybrid"): MethodDefinition[] {
  return ALL_METHODS.filter((m) => m.deliveryApproach === approach);
}
