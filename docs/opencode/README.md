# OpenCode Configuration for MyNewAp1Claude

## Why Not One Giant Prompt

The Full-Stack Expert AI spec (`full-stack-expert-skills.v2.json`) contains 200+ rules, skills, and behavioral constraints. Pasting it as a single prompt blob would:
- Exceed practical context limits
- Mix repo-specific policy with generic expert behavior
- Make rules impossible to update independently
- Prevent role-specific agent behavior

Instead, the spec is **distributed** across OpenCode-native configuration surfaces.

## How It's Distributed

```
opencode.jsonc                     ← config: providers, permissions, instructions, default agent
  └─ instructions:
       ├─ AGENTS.md                ← repo operating policy (5-agent team, mandatory order)
       ├─ CLAUDE.md                ← device/workflow constraints
       ├─ ARCHITECTURE.md          ← platform architecture reference
       └─ docs/opencode/
            └─ full-stack-expert-rules.md  ← expert behavior rules (from JSON spec)

.opencode/agents/                  ← role-specific agents
  ├─ planner.md                    ← inspect + plan, no edits
  ├─ reviewer.md                   ← strict audit, no rewrites
  ├─ debugger.md                   ← root-cause analysis
  ├─ security-reviewer.md          ← security audit
  └─ docs-writer.md                ← documentation generation

.opencode/commands/                ← reusable workflows
  ├─ audit-job.md                  ← audit implementation against prompt
  ├─ inspect-module.md             ← module inspection report
  └─ full-review.md                ← end-to-end review before completion

docs/opencode/
  ├─ README.md                     ← this file
  ├─ full-stack-expert-rules.md    ← operational rules (loaded as instructions)
  ├─ full-stack-expert-skills.v2.json  ← source JSON (reference artifact)
  └─ AGENT_MAP.md                  ← agent/command reference
```

## How They Work Together

1. **AGENTS.md** defines the repo's mandatory team model (Planner → Builder → Reviewer → Tester → Governance)
2. **full-stack-expert-rules.md** defines expert behavioral constraints (no guessing, inspect before edit, validation before completion)
3. **Agents** implement specific roles with focused constraints
4. **Commands** provide repeatable workflows for common tasks
5. **opencode.jsonc** ties it all together with safe permission defaults

## Updating the Rules

1. Edit `docs/opencode/full-stack-expert-skills.v2.json` with the updated spec
2. Regenerate `docs/opencode/full-stack-expert-rules.md` from the JSON
3. Update agents/commands if new roles or workflows are needed
4. The JSON is the source of truth — the markdown is the operational form
