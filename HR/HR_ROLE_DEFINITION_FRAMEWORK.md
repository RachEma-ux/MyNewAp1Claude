# HR role-definition framework

## Document Control

- **Document type:** Domain framework + operational standard
- **Intended repo path:** `docs/hr/HR_ROLE_DEFINITION_FRAMEWORK.md`
- **Module:** Human Resources (`hr`)
- **Status:** Draft, repo-ready
- **Primary audience:** HR, hiring managers, department directors, executives, workspace admins, governance reviewers, product and platform teams
- **Primary purpose:** Standardize how roles are defined, approved, versioned, published, and consumed across the Human Resources module and the rest of the platform
- **Related artifacts:** `HR_MODULE_IMPLEMENTATION_ROADMAP.md`, `HR_ROLE_VISIBILITY_MATRIX.md`, `HR_RACI_MODEL.md`, `HR_SECURITY_AND_COMPLIANCE.md`
- **Repository alignment sources:** `AGENTS.md`, `ARCHITECTURE.md`, `HR/HR_MODULE_IMPLEMENTATION_ROADMAP.md`, `HR/HR_MODULE_AUDIT_REPORT.md`

---

## 1. Executive Summary

In this app, role definition cannot be treated as a simple HR writing exercise. It is a platform-level control surface.

A role definition explains **why a role exists, what outcomes it owns, what decisions it can make, where its boundaries start and end, and how success is measured**. It is not merely a list of chores or a hiring advertisement. In MyNewAp1Claude, role definitions must also support:

- workforce planning and staffing
- position management
- workspace assignment
- performance calibration
- visibility and privacy controls
- approval routing
- auditability
- analytics
- controlled integrations with other platform modules

This framework establishes a professional, app-ready standard for defining roles so that HR records, workspace operations, and governance controls all consume the same authoritative structure.

The framework is designed for a platform where HR is a first-class, independent domain, but one that is deeply integrated with workspaces, access control, and governance. For that reason, this document treats role definitions as **structured, versioned, effective-dated, policy-aware records**, not static prose documents.

---

## 2. Purpose

This framework exists to make role definition reliable, repeatable, and machine-usable across the platform.

It standardizes:

1. what a role definition is
2. when a role definition must be created or updated
3. who participates in the process
4. what mandatory fields must exist
5. how role definitions are approved and published
6. how they connect to positions, people, workspaces, and permissions
7. how sensitive content is controlled
8. how role definitions are reviewed over time

---

## 3. Scope

This framework applies to all roles represented by the HR module, including:

- employee roles
- manager roles
- specialist and professional roles
- cross-functional operational roles
- executive roles
- workspace-linked staffing roles
- new roles created for organizational growth, restructuring, or transformation

This framework covers the **definition of the role** itself. It does **not** replace:

- employment contracts
- compensation letters
- individual performance reviews
- access-control policies
- project-level task assignments
- org charts as standalone artifacts
- process RACI documents for non-HR workflows

Those artifacts may reference the role definition, but they are not the same thing.

---

## 4. Why role definition matters in this app

In a generic company, role definition supports hiring and performance.  
In this app, it does more than that.

Because the repository already positions HR as an independent domain that must integrate with workspaces, staffing, permissions, documents, analytics, and governance, role definition becomes part of the platform operating model.

### 4.1 Operational value

A well-defined role helps the platform answer questions such as:

- Why does this role exist?
- What business outcome does it own?
- What does success look like?
- What decision rights come with it?
- What data and tools does it require?
- What should be visible to the role holder, their manager, HR, and admins?
- What workspaces can this role be assigned to?
- What approvals should route through this role?

### 4.2 Platform value

A role definition in MyNewAp1Claude should support:

- **Recruitment and hiring:** create accurate role profiles and job descriptions
- **Position management:** link open or filled positions to a standardized role record
- **Staffing and assignments:** map humans to workspaces and responsibilities
- **Performance management:** seed measurable outcome expectations
- **Organizational clarity:** reduce overlap, ambiguity, and missing ownership
- **Compensation architecture:** support grading and benchmarking without making compensation the primary identity of the role
- **Retention and engagement:** clarify purpose, growth path, and contribution
- **Conflict reduction:** define boundaries and collaboration interfaces
- **Governance:** provide auditable, reviewable, policy-aware role records
- **Visibility control:** drive route-level and field-level access expectations

### 4.3 Why the framework must be structured

Free-text job descriptions are not sufficient for this app.

The platform needs structured role data because the role definition may later feed:

- `hr.positions`
- `hr.organization`
- `hr.staffing`
- `hr.performance`
- `hr.analytics`
- workspace approval flows
- role visibility rules
- downstream document generation

For that reason, every authoritative role definition must be a structured record first and a narrative document second.

---

## 5. Canonical definitions

The app needs consistent language. The following distinctions are mandatory.

| Term | Definition | Not the same as |
|---|---|---|
| **Role Definition** | The canonical description of a role’s purpose, outcomes, authority, boundaries, requirements, and success measures | A person, a position, or a permission bundle |
| **Position** | A staffed or unstaffed seat linked to a role definition, org unit, and reporting line | The abstract role definition |
| **Person** | A human identity in the HR system | The position they occupy |
| **Employee / Worker Profile** | The employment-facing record attached to a person | The reusable role definition |
| **Responsibility** | A specific accountability or owned outcome within a role | The complete role |
| **Task / Activity** | A recurring or one-off action performed by someone | A role outcome or accountablity model |
| **Decision Right** | A defined authority that the role may exercise without escalation, or within specified limits | A generic responsibility |
| **Permission** | A system-level access entitlement controlled by security policy | The business role itself |
| **Workspace Assignment** | A contextual mapping of a person or role holder into a workspace, team, or mission | A permanent job architecture object |
| **RACI Assignment** | A process-level mapping of Responsible, Accountable, Consulted, and Informed participants | A role definition record |

### 5.1 Core rule

A role definition answers **“who this role is in the organization and why it exists.”**  
It should not degrade into a task dump.

### 5.2 Core distinction between role and permission

A role definition may inform access design, but it does not automatically grant system permissions.

Actual access must be derived through the platform’s security and governance model, using role visibility rules, contextual scope, workspace relationship, and policy evaluation.

### 5.3 Core distinction between role and person

The role definition belongs to the organization.  
The individual employee occupies a position that references the role definition.

This allows the platform to maintain continuity when people are hired, promoted, transferred, or leave.

---

## 6. Design principles

Every role definition in this app must follow these principles.

### 6.1 Outcome-first
The role is defined by outcomes and business value, not by a random collection of activities.

### 6.2 Boundary-aware
The role must explicitly state where its authority begins, where it ends, and what requires escalation.

### 6.3 Workspace-aware
The role should be usable in workspace staffing and workflow ownership models.

### 6.4 Policy-aware
Sensitive changes must be reviewable, approvable, auditable, and visible only to authorized personas.

### 6.5 Schema-first
The canonical role definition must be structured enough to support APIs, DTOs, validation, and downstream automation.

### 6.6 History-preserving
Changes must not silently overwrite the past. Approved role definitions should be versioned and effective-dated.

### 6.7 Privacy-segmented
Sensitive content must be classified so that the UI and backend can shape what each persona can see.

### 6.8 Human-readable and machine-enforceable
The framework must be understandable to HR and managers while remaining precise enough for the platform to implement.

---

## 7. When a role definition is required

A role definition must be created or refreshed when any of the following occur:

- a new role is proposed
- a position is created for a materially different role
- a department is restructured
- a reporting line changes materially
- decision rights change
- accountabilities are moved between teams
- a job family or grade model is redesigned
- a role is expanded to support workspace staffing or approval ownership
- a role becomes subject to new compliance, privacy, or access requirements
- an existing role has become stale, ambiguous, duplicated, or inconsistent
- recruitment begins for a role that does not have an active approved definition

### 7.1 Review triggers

A role definition should also be reviewed when:

- the incumbent and manager report a mismatch between definition and reality
- performance measures are unclear or not actionable
- repeated cross-team conflicts indicate unclear boundaries
- access requests repeatedly exceed the documented role scope
- the role has not been reviewed within the defined cadence

---

## 8. Governance and accountability model

Role definition is shared work, but accountability must remain explicit.

### 8.1 Primary actors

| Actor | Primary contribution |
|---|---|
| **Hiring Manager / Direct Manager** | Defines operational need, day-to-day accountabilities, outcome expectations, collaboration dependencies, and performance standards |
| **HR Manager / HRBP** | Formalizes the role, ensures consistency with job architecture, checks legal and policy alignment, maintains templates, and validates language quality |
| **Department Director** | Confirms strategic fit, target outcomes, span, and long-term departmental alignment |
| **Executive Sponsor** | Approves high-impact or newly created strategic roles |
| **Incumbent Employee** | Provides current-state evidence when an existing role is being redefined |
| **Admin / Platform Owner** | Ensures publication path, system configuration, and visibility implementation are ready where the app consumes role data |
| **Governance Reviewer** | Ensures the role definition respects privacy, control points, and policy boundaries where required |

### 8.2 Special case: executive roles

For C-level roles or roles that materially affect enterprise control, the approval path must include the appropriate executive or board-level authority according to company governance.

### 8.3 Canonical RACI for role-definition lifecycle

| Lifecycle activity | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| Identify need for new or changed role | Manager / Director | Department Director | HRBP | HR Admin |
| Perform current-state audit | Manager + Incumbent | Manager | HRBP | Director |
| Draft role definition | Manager | Manager | HRBP, Incumbent | Director |
| Validate structure, language, and compliance | HRBP | HR Manager | Manager, Director | Admin |
| Approve business scope and decision rights | Director | Director | HRBP, Manager | Executive if relevant |
| Approve strategic or sensitive role changes | Executive Sponsor | Executive Sponsor | Director, HR Head | Governance |
| Publish approved version | HR Admin | HR Manager | Admin, Manager | Stakeholders |
| Map to position and staffing objects | HR Admin / HR Ops | HR Manager | Manager, Admin | Director |
| Implement visibility and access expectations | Admin / Security | Platform or Security Owner | HR Manager, Governance | Manager |
| Schedule periodic review | HR Admin | HR Manager | Manager | Stakeholders |

### 8.4 Accountability rule

There must be **one accountable owner** for each approval checkpoint.  
Shared consultation is acceptable. Shared final accountability is not.

---

## 9. Role-definition lifecycle

This framework uses a controlled lifecycle, not an ad hoc writing process.

### 9.1 Lifecycle stages

| Stage | Purpose | Typical owner | Output |
|---|---|---|---|
| **Requested** | A business need or role-change trigger is recorded | Manager / Director | Intake request |
| **Discovery** | Strategy, gaps, overlaps, and constraints are assessed | Manager + HRBP | Discovery notes |
| **Draft** | Structured role definition is written | Manager | Draft role definition |
| **Review** | Structure, clarity, compliance, and alignment are checked | HRBP | Reviewed draft |
| **Approval Pending** | Formal sign-off is routed | HR Manager / Director | Approval package |
| **Approved** | Role is officially accepted | Approver | Approved version |
| **Published** | Role becomes the active canonical record | HR Admin | Published record |
| **Effective** | Role becomes operational on its effective date | HR Ops / Platform | Active role version |
| **Superseded** | A newer approved version replaces it | HR Admin | Historical archive |
| **Retired** | Role is no longer active for new positions | HR Manager / Director | Retired record |

### 9.2 Effective-dating rule

An approved role definition must include:

- `effectiveFrom`
- `effectiveTo` when retired or superseded
- a version number
- a status
- the approver
- change rationale

This prevents silent rewriting of historical records.

### 9.3 Change types

The platform should distinguish at least these change types:

- **Minor wording change:** wording improves clarity without changing authority, scope, or outcomes
- **Material role change:** accountabilities, boundaries, KPIs, or required capabilities change
- **Structural change:** org placement, reporting line, job family, or grade changes
- **Security or visibility change:** role visibility expectations or sensitivity class changes
- **Retirement:** role is no longer active for future staffing

Only minor wording changes may follow a lighter path. Material, structural, or visibility changes require formal review and approval.

---

## 10. Canonical role-definition standard

This section defines the minimum structure of an approved role definition.

### 10.1 Mandatory sections

#### A. Role identification
Every role definition must contain:

- role title
- role code or role ID
- department / org unit
- job family
- level / grade
- role status
- reporting line
- direct reports scope, if any
- location or legal-entity scope where relevant
- version
- effective date

#### B. Role purpose
A concise statement describing:

- why the role exists
- what organizational problem it solves
- how it contributes to the company or platform mission

This should usually be one short paragraph, not a page of text.

#### C. Core accountabilities
A role must include 5 to 7 outcome-oriented accountabilities where possible.

Each accountability should describe:

- the owned result
- the nature of the work
- the expected standard
- the cross-functional interface, if relevant

#### D. Decision rights
The definition must separate:

- decisions the role may make independently
- decisions it may recommend but not approve
- decisions requiring manager, HR, director, security, or executive sign-off

#### E. Boundaries and exclusions
Every role definition must state what the role does **not** own, or what sits with adjacent roles.

This is essential for reducing overlap.

#### F. Collaboration model
The definition should identify the role’s key interfaces:

- manager
- peer roles
- HR
- other departments
- workspace owners
- governance or admin functions, if relevant

#### G. Competencies and requirements
Include:

- essential technical skills
- essential soft skills
- required education, certification, or license
- required experience
- preferred qualifications, separated from mandatory ones

#### H. Success metrics
Each role must contain measurable signals of success.

Use 2 to 5 role-level metrics where possible.  
Metrics should be meaningful and not merely easy to count.

#### I. Risk, compliance, and sensitivity notes
Where relevant, include:

- confidentiality obligations
- regulatory or policy obligations
- sensitive data handled
- approval or segregation-of-duties constraints
- audit expectations

#### J. Governance metadata
The record must include:

- document owner
- approver
- last review date
- next review date
- change rationale
- source artifacts, where relevant

### 10.2 Optional but recommended sections

Include these where useful:

- tools and systems used
- typical internal customers
- external stakeholder exposure
- travel or schedule requirements
- workspace-assignment rules
- substitution / delegation guidance
- growth path or adjacent roles
- onboarding-critical knowledge

### 10.3 Strongly discouraged content

Avoid:

- vague clichés
- duplicated company boilerplate
- unbounded lists of chores
- hidden approval rules
- unstated sensitive responsibilities
- mixed mandatory and preferred requirements without labels
- unreviewed legacy wording copied from old job ads

---

## 11. Writing standards

Role definitions must be written for clarity, fairness, and operational usefulness.

### 11.1 Writing rules

- Use plain language.
- Prefer outcome-focused wording over activity dumps.
- Start accountabilities with strong verbs.
- Use consistent role titles.
- Keep the purpose statement concise.
- Separate role duties from approval rights.
- Separate essential from preferred requirements.
- Use gender-neutral, non-exclusionary language.
- Remove internal jargon unless it is truly required.
- Avoid listing every occasional task.

### 11.2 Outcome-writing examples

Prefer:

- “Owns onboarding case completion within target timeline and quality standards.”
- “Leads workplace relations cases in accordance with policy and escalation rules.”
- “Maintains accurate employee data and change history across defined HR records.”

Avoid:

- “Handles many HR tasks.”
- “Supports the team as needed.”
- “Does onboarding paperwork.”
- “Helps with employee questions and other things.”

### 11.3 KPI quality rules

A good role KPI should be:

- relevant to the role’s purpose
- influenced by the role holder
- measurable with reasonable effort
- stable enough to compare over time
- not distortive or gameable

### 11.4 Bias and accessibility rules

Every role definition must be reviewed for:

- biased or exclusionary wording
- unnecessary credential inflation
- hidden availability assumptions
- inaccessible jargon
- excessive complexity

---

## 12. Role visibility and privacy model

This section matters because the repo already treats HR visibility as a major design concern.

Role definitions often include both harmless and sensitive information.  
The framework must therefore support route-level and field-level visibility.

### 12.1 Canonical personas

Use these baseline personas unless the module introduces a stricter model:

- **Employee**
- **Manager**
- **HRBP**
- **Admin**

Additional personas may be introduced later, but these four form the minimum baseline.

### 12.2 Sensitivity tiers

Use these data classes for role-definition and related HR content where applicable:

| Sensitivity tier | Typical usage |
|---|---|
| `public_internal` | Non-sensitive role title, team, purpose summary |
| `team_visible` | Team-facing accountabilities and collaboration interfaces |
| `manager_visible` | Manager-only scope details or role planning notes |
| `hr_restricted` | HR-specific evaluation notes, staffing rationale, compliance comments |
| `admin_restricted` | Configuration, control, or platform-linked metadata |
| `confidential_case` | Restricted relations or case-linked content that should not be broadly exposed |

### 12.3 Visibility rules

- Employees may view role information relevant to their own current role and approved self-service material.
- Managers may view role information necessary to supervise team members and manage staffing.
- HRBP may view broader lifecycle and structural role data across their scope.
- Admin may manage configuration, publishing, and policy-linked metadata where authorized.
- Sensitive compensation, relations, or case content must not be exposed merely because someone can view a generic role profile.

### 12.4 Critical policy rule

A visibility matrix is not enough on its own.  
The backend and frontend must both enforce the visibility model.

That means:

- backend DTO shaping
- route-level checks
- field masking
- audit logging for sensitive reads where required

### 12.5 Role-definition content that should usually remain visible

- role title
- team / department
- role purpose
- high-level accountabilities
- reporting relationship
- required qualifications
- success metrics at a non-sensitive level

### 12.6 Role-definition content that may require restriction

- compensation benchmark notes
- workforce planning rationale
- restructuring notes
- disciplinary or relations context
- sensitive succession comments
- security or segregation-of-duties annotations beyond business need

---

## 13. Relationship to other HR objects

Role definition is foundational, but it is not the whole HR model.

### 13.1 Job architecture
A role definition should belong to a job family and level model where one exists.

### 13.2 Positions
A position should reference one approved active role definition.  
Multiple positions may reference the same role definition.

### 13.3 People and employment records
A person or employee record should reference the occupied position, not overwrite the role definition itself.

### 13.4 Workspace staffing
Workspace assignments should map people into workspace context while retaining the underlying role definition and organizational home.

### 13.5 Performance
Role KPIs provide the baseline expectation.  
Individual goals may refine them but should not erase the role-level standard.

### 13.6 Compensation
Role definitions support leveling and compensation discussions, but compensation decisions require additional controls and should not be embedded into the role’s public identity.

### 13.7 Recruitment
Approved role definitions should seed:

- requisitions
- job descriptions
- interview scorecards
- onboarding plans

### 13.8 Compliance and audit
When role definitions influence access, approvals, or sensitive work, the framework must maintain history and traceability.

---

## 14. Integration with platform modules

This framework is specifically shaped for MyNewAp1Claude.

### 14.1 HR module integration

Role definitions should connect cleanly to these HR capabilities:

- directory and employee profile
- organization tree
- positions
- staffing
- recruitment
- lifecycle operations
- performance
- analytics
- compliance

### 14.2 Workspace integration

The role-definition record should help answer:

- who can be assigned to a workspace?
- who should approve within a workspace?
- which role carries which business accountability?
- which role requires visibility into which records?
- which role should be included in onboarding, offboarding, or review workflows?

### 14.3 Security integration

Role definitions may propose expected access patterns, but actual access must be resolved through the platform’s policy and permission model.

### 14.4 Governance integration

Role-definition records should support:

- auditability
- controlled approval paths
- effective-dated history
- restricted visibility
- clear source-of-truth ownership

### 14.5 Document integration

Narrative role descriptions, attachments, and supporting evidence may be stored as documents, but the structured record must remain canonical.

---

## 15. Standard role-definition template

Use the following template for every new or materially changed role.

### 15.1 Blank template

#### Role Identification
- **Role title:**
- **Role code / ID:**
- **Department / org unit:**
- **Job family:**
- **Level / grade:**
- **Reports to:**
- **Direct reports:**
- **Location / legal entity scope:**
- **Employment type:**
- **Version:**
- **Status:**
- **Effective from:**
- **Effective to:**

#### Role Purpose
- **Role summary:**  
  One short paragraph explaining why the role exists, the problem it solves, and its unique contribution.

#### Core Accountabilities
1.  
2.  
3.  
4.  
5.  
6.  
7.  

#### Decision Rights
- **Can decide independently:**
- **Can recommend but not approve:**
- **Requires approval from:**

#### Boundaries and Exclusions
- **In scope:**
- **Out of scope:**
- **Escalation triggers:**

#### Collaboration Interfaces
- **Key internal partners:**
- **Key cross-functional dependencies:**
- **Workspace or project interfaces:**
- **Customer or external interfaces, if any:**

#### Competencies and Requirements
- **Essential technical skills:**
- **Essential behavioral skills:**
- **Required education / certification:**
- **Required experience:**
- **Preferred qualifications:**

#### Success Metrics
- **KPI 1:**
- **KPI 2:**
- **KPI 3:**
- **Quality indicators:**
- **Review cadence:**

#### Risk / Compliance / Sensitivity
- **Sensitive data handled:**
- **Key policy obligations:**
- **Visibility class:**
- **Segregation-of-duties constraints:**

#### Governance Metadata
- **Draft owner:**
- **Reviewed by:**
- **Approved by:**
- **Last review date:**
- **Next review date:**
- **Change rationale:**
- **Related role versions / superseded records:**

---

## 16. Existing-team role audit template

When defining roles for an existing team, capture current reality first.

### 16.1 Audit template

| Section | What to capture |
|---|---|
| **Role Purpose** | Why the role actually exists today |
| **Current Deliverables** | The 3 to 5 most important outputs the person is producing |
| **Decision Rights** | What they already decide without asking |
| **Escalations** | What repeatedly gets escalated and why |
| **Big 3 KPIs** | How success is currently judged in practice |
| **Collaboration Needs** | Which roles they depend on to succeed |
| **Overlap Risks** | Which responsibilities are duplicated with others |
| **Gap Risks** | Which responsibilities are falling between teams |
| **Tooling / Data Needs** | Which tools, data, or systems they rely on |
| **Suggested Changes** | What should change in the formal role definition |

### 16.2 Audit method

1. Ask the incumbent to document what they currently do.
2. Ask the manager to describe what they believe the role should do.
3. Compare both views.
4. Resolve overlap, ambiguity, and missing ownership.
5. Update the structured role definition.
6. Route it through review and approval.

---

## 17. Example role definition – HR Generalist

This example is adapted into a platform-friendly structure.

### 17.1 Role Identification

- **Role title:** HR Generalist
- **Department / org unit:** People & Culture
- **Job family:** Human Resources Operations
- **Level:** Professional / Mid-Level
- **Reports to:** HR Manager
- **Direct reports:** None
- **Status:** Active
- **Visibility class:** `team_visible` with restricted HR-specific sections

### 17.2 Role Purpose

The HR Generalist is the primary operational contact across the employee lifecycle. The role exists to keep day-to-day HR processes accurate, timely, compliant, and human-centered across recruitment, onboarding, records maintenance, employee relations support, and manager enablement. It supports workforce continuity and a healthy employee experience while ensuring that HR records and practices remain reliable.

### 17.3 Core Accountabilities

1. Owns day-to-day HR operational workflows across recruitment coordination, onboarding, employee changes, and offboarding support.
2. Maintains accurate HR records and ensures that changes to employment data are captured promptly and correctly.
3. Supports managers with role setup, onboarding readiness, and basic performance-cycle administration.
4. Serves as a first-line contact for employee questions and routes sensitive issues through the correct policy and escalation path.
5. Coordinates with hiring stakeholders to maintain role and requisition quality.
6. Helps monitor compliance with HR policies, required documentation, and lifecycle deadlines.
7. Contributes to retention and employee-experience improvements by identifying recurring friction points and process gaps.

### 17.4 Decision Rights

- **Can decide independently:** routine HR process coordination, scheduling, document completeness checks, standard onboarding readiness, first-line employee guidance within policy
- **Can recommend but not approve:** compensation changes, disciplinary actions, employment status changes, policy exceptions
- **Requires approval from:** HR Manager or designated authority for material employee actions and exceptions

### 17.5 Boundaries and Exclusions

- Does not independently approve compensation or disciplinary outcomes.
- Does not set organization-wide HR policy without authorization.
- Does not own final legal interpretation or executive workforce planning decisions.

### 17.6 Competencies and Requirements

- **Essential technical skills:** HRIS fluency, records accuracy, workflow coordination, reporting basics
- **Essential behavioral skills:** discretion, empathy, communication, conflict de-escalation, organization
- **Required education / certification:** degree or equivalent professional experience in HR, business, or a related field
- **Required experience:** practical experience supporting HR operations across multiple lifecycle stages
- **Preferred qualifications:** recognized HR certification, change-management or employee-relations exposure

### 17.7 Success Metrics

- time-to-hire support timeliness
- onboarding case completion within target window
- HR record accuracy and completeness
- new-hire retention contribution indicators
- employee query response timeliness
- compliance completion rates for required HR documentation

### 17.8 Platform integration notes

This role may interact with:

- employee profile and records views
- onboarding and offboarding workflows
- recruitment request support
- basic analytics and workforce reporting
- role-definition maintenance for operational HR roles

---

## 18. Operating checklists

### 18.1 Preparation and alignment checklist

- Confirm the business need for the role.
- Confirm whether an existing active role definition already covers the need.
- Identify stakeholders.
- Confirm budget and grade assumptions.
- Check whether this is a new role, a revised role, or a reused role.
- Identify whether the role will participate in workspace staffing, approvals, or restricted-data handling.
- Determine whether the role introduces new visibility or privacy requirements.

### 18.2 Draft quality checklist

- Is the purpose clear?
- Are the accountabilities outcome-focused?
- Are decision rights explicit?
- Are boundaries and exclusions stated?
- Are essential and preferred requirements separated?
- Are KPIs meaningful?
- Is the language free of jargon and bias?
- Is sensitive content classified appropriately?

### 18.3 Approval checklist

- Has the manager signed off?
- Has HR reviewed consistency and compliance?
- Has the department owner approved the business scope?
- Has the correct executive authority approved strategic or sensitive changes?
- Has the visibility class been validated?
- Has the next review date been set?

### 18.4 Publication checklist

- Structured record saved
- version assigned
- effective date assigned
- superseded versions linked
- visibility class applied
- position mapping updated
- downstream consumers notified where required

### 18.5 Review and maintenance checklist

- Has the role drifted from reality?
- Have boundaries become unclear?
- Have KPIs become obsolete?
- Has the org structure changed?
- Has the role gained or lost approval authority?
- Has the role started handling more sensitive data?
- Does the role definition still support recruitment and staffing needs?

---

## 19. Implementation guidance for MyNewAp1Claude

This section explains how this framework should be applied in the repo.

### 19.1 Recommended artifact set

This framework should sit alongside a small authoritative set:

- `docs/hr/HR_ROLE_DEFINITION_FRAMEWORK.md`
- `docs/hr/HR_ROLE_VISIBILITY_MATRIX.md`
- `docs/hr/HR_RACI_MODEL.md`
- `docs/hr/HR_SECURITY_AND_COMPLIANCE.md`
- optional template artifact: `docs/hr/HR_ROLE_DEFINITION_TEMPLATE.md`

### 19.2 Canonical authority rule

Use this hierarchy:

1. **This framework** defines the standard
2. **Role records / structured entities** represent operational instances
3. **Role visibility matrix** governs who can see what
4. **RACI model** governs process ownership patterns
5. **Derived diagrams** are non-canonical views only

### 19.3 Suggested structured entity fields

For implementation, the HR domain should be able to persist at least:

- `roleDefinitionId`
- `title`
- `roleCode`
- `departmentId`
- `jobFamilyId`
- `jobLevelId`
- `reportsToRoleDefinitionId` or reporting descriptor
- `purposeSummary`
- `accountabilities[]`
- `decisionRights`
- `boundaries`
- `requiredSkills[]`
- `requiredQualifications[]`
- `preferredQualifications[]`
- `successMetrics[]`
- `sensitivityClass`
- `status`
- `version`
- `effectiveFrom`
- `effectiveTo`
- `ownerId`
- `approvedById`
- `lastReviewedAt`
- `nextReviewAt`
- `changeReason`

### 19.4 API and UI expectations

The app should eventually support:

- listing role definitions
- viewing published role profiles
- creating draft role definitions
- routing role changes for review
- activating new versions
- comparing old and new versions
- filtering by department, family, level, status, and visibility
- linking role definitions to positions and staffing
- auditing who viewed or changed restricted role information where policy requires it

### 19.5 Security and governance rule

Role-definition content must not rely on documentation alone for enforcement.  
The platform should enforce route-level and field-level rules through backend guards and DTO shaping.

### 19.6 Current-repo implication

Where the repository already has advisory role-visibility or permission logic, this framework should be used to make that logic authoritative and executable, especially for restricted HR content.

### 19.7 Publication pattern

A role definition should only become active when all of the following are true:

- required approvals completed
- structured record validated
- visibility class assigned
- effective date set
- linked position or staffing logic updated where relevant
- superseded version archived correctly

---

## 20. Acceptance criteria for v1

The framework is ready for operational use when:

1. every active position can reference one active approved role definition
2. the system can distinguish role definition from person, position, and permission
3. role definitions carry version, status, and effective dates
4. visibility class is assigned and consumed by the application model
5. changes are reviewable and auditable
6. managers and HR can use a standard template without inventing their own structure
7. recruitment, staffing, and performance workflows can consume approved role content
8. outdated definitions can be superseded without destructive overwrite
9. sensitive role-linked notes do not leak through generic views
10. the framework coexists cleanly with separate RACI and visibility artifacts

---

## Appendix A – Optional department role-definition canvas

The source material also included department-level thinking. That content is useful, but it should not replace role definitions.

Use the following as a **supporting unit charter**, not as the canonical role record.

| Section | Purpose |
|---|---|
| **Department Name** | Identify the function |
| **Primary Mission** | State the department’s north-star purpose |
| **Core Accountability** | State the most important metric or owned outcome |
| **Boundary Lines** | Define where the function starts and ends |
| **Decision Rights** | Define the major choices the function can make |
| **Required Inputs** | Describe what it needs from other departments |

This canvas helps align heads of function before sub-role design begins.

---

## Appendix B – Role definition versus RACI

Role definition and RACI are related, but they solve different problems.

| Artifact | Primary question |
|---|---|
| **Role Definition** | What is this role, why does it exist, and what does it own? |
| **Position Record** | Which seat is open or occupied? |
| **Workspace Assignment** | Who is participating in this workspace context? |
| **RACI Matrix** | In this process, who is Responsible, Accountable, Consulted, or Informed? |
| **Permission Policy** | What system actions may this actor perform? |

The product should keep those artifacts separate but linked.

---

## Appendix C – Recommended review cadence

Use these default cadences unless a stricter policy is required:

- **New strategic roles:** review at 3 to 6 months after activation
- **Operational roles:** review every 12 months
- **Roles affected by reorganization or compliance change:** immediate out-of-cycle review
- **Roles with repeated staffing or performance ambiguity:** targeted review within the next planning cycle

---

## Closing note

The goal of this framework is simple:

**one role, one authoritative definition, clearly approved, clearly versioned, clearly visible, and usable by both people and the platform.**

That standard is what allows the HR module to remain professional, scalable, and governable inside MyNewAp1Claude.
