# PS Active Matrix — v1.0.0

## Scopes (3)

| ID | Code | Label | Family |
|----|------|-------|--------|
| 12 | SOFTWARE_LIFECYCLE | Software Lifecycle | SOFTWARE_IT_ENGINEERING |
| 13 | PROJECT_GOVERNANCE | Project Governance | PM_GOVERNANCE |
| 14 | AGILE_TEAM_DELIVERY | Agile Team Delivery | AGILE_PRODUCT_DELIVERY |

## Questions (5)

| ID | Code | Label | Description |
|----|------|-------|-------------|
| 16 | EVOLVING_REQUIREMENTS | Are requirements expected to evolve during delivery? | Requirement volatility signal |
| 17 | SOFTWARE_CENTRIC | Is the work software/service-centric? | Software/service orientation signal |
| 18 | MULTI_TEAM | Does the initiative involve multiple coordinated teams? | Multi-team coordination signal |
| 19 | HIGH_COMPLIANCE | Is heavy compliance/control required? | Governance/control intensity signal |
| 20 | NEED_SPEED | Is speed/agility a major objective? | Speed/agility signal |

## Weight Matrix (5 x 3)

| Question | Software Lifecycle (12) | Project Governance (13) | Agile Team Delivery (14) |
|----------|------------------------|------------------------|--------------------------|
| EVOLVING_REQUIREMENTS | 2 | 0 | **3** |
| SOFTWARE_CENTRIC | **4** | 1 | 2 |
| MULTI_TEAM | 1 | 2 | 2 |
| HIGH_COMPLIANCE | 1 | **4** | 0 |
| NEED_SPEED | 2 | 0 | **3** |
| **Max possible** | **10** | **7** | **10** |

## Scoring Logic

- For each question answered "Yes", add that cell's weight to the scope's score
- Questions answered "No" or unanswered contribute 0
- Winner = scope with highest total score
- Winner margin = (1st place score) - (2nd place score)
- Confidence gate: HIGH (margin >= 15), MEDIUM (margin >= 8), LOW (margin < 8)

## Dimensions (6)

| Dimension | Values |
|-----------|--------|
| Domain | Software / IT / Engineering, PM Governance |
| Organizational Level | Project, Program |
| Criticality / Regulation | Low, High |
| Delivery Style | Agile, Traditional |
| Value Orientation | Speed / Agility, Governance / Control |
| Lifecycle Focus | Product Lifecycle, Project Lifecycle |

## Text Analysis Keyword Rules

### EVOLVING_REQUIREMENTS
- **Yes signals:** agile, iterative, evolving, changing requirements, uncertain, flexible, mvp, prototype, experiment, adapt, pivot, discovery, exploratory, incremental, emerging, dynamic, user feedback, continuous improvement, lean startup
- **No signals:** fixed scope, fixed requirements, waterfall, predefined, rigid, locked, frozen requirements, specification complete, signed off requirements, stable scope

### SOFTWARE_CENTRIC
- **Yes signals:** software, application, app, code, api, platform, digital, system, microservice, frontend, backend, database, cloud, saas, web, mobile app, deployment, devops, ci/cd, tech stack, programming, developer, service-oriented, integration, automation tool
- **No signals:** construction, building, physical, manufacturing, hardware only, civil engineering, mechanical, non-technical, manual process, paper-based

### MULTI_TEAM
- **Yes signals:** multiple teams, cross-functional, cross functional, departments, coordination, organization-wide, enterprise, program, portfolio, multi-team, distributed teams, global teams, stakeholders across, inter-departmental, multi-disciplinary, several teams, large-scale, company-wide, business units
- **No signals:** single team, one team, small team, solo, individual, standalone, isolated, self-contained

### HIGH_COMPLIANCE
- **Yes signals:** compliance, regulation, regulatory, audit, security, gdpr, sox, hipaa, pci, iso 27001, certification, governance, legal requirement, data protection, privacy, financial regulation, medical device, fda, gxp, safety-critical, controlled environment, validated, aspice, cmmi, iec 62443
- **No signals:** no regulation, no compliance, internal only, low risk, informal, no audit

### NEED_SPEED
- **Yes signals:** fast, speed, quick, rapid, urgent, deadline, time-to-market, accelerate, asap, sprint, velocity, competitive pressure, first mover, launch soon, time-sensitive, tight timeline, aggressive schedule, quick turnaround, race, expedite
- **No signals:** no rush, long-term, multi-year, phased rollout, no deadline pressure, deliberate, careful planning, thorough analysis first

## Known Limitations

- Matrix is designed for **software/IT project classification only**
- All 3 scopes are tech-oriented — no coverage for agriculture, manufacturing, or general business ventures
- Generic words like "system", "fast", "coordination" trigger false positives for non-software scenarios
- Max winner margin is 10, making the HIGH threshold (>= 15) unreachable with current weights
