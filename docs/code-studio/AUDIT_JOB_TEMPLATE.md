# Code Studio — Audit Job Template

## Overview

The **Audit Job** is a built-in template that creates audit/review jobs.
It accepts a target implementation prompt and generates a job that instructs
the coding agents to audit the actual repository code against that prompt.

## How It Works

1. User clicks "New Job" > "Use Template" > selects "Audit Job"
2. User pastes the original implementation prompt into the "Target prompt to audit" field
3. Optionally adds extra audit notes
4. Previews the generated objective
5. Creates the job

## Variables

| Variable | Label | Type | Required | Purpose |
|---|---|---|---|---|
| `targetPrompt` | Target prompt to audit | long_text | Yes | The original implementation prompt to audit against |
| `scopeNotes` | Extra audit notes | long_text | No | Additional context or focus areas |

## Generated Objective

The template generates a comprehensive audit prompt that instructs agents to:

1. Read and follow AGENTS.md (mandatory 5-agent model)
2. Execute in order: Planner > Builder > Reviewer > Tester > Governance
3. Inspect actual repository code
4. Compare implementation against every requirement in the target prompt
5. Check for regressions, scope drift, partial implementations, wrong fixes
6. Produce a strict evidence-based verdict with file:line references
7. Rate overall compliance: PASS / PARTIAL / FAIL

## Template Source

The Audit Job template is seeded via `codeStudio.templates.seed` or automatically
when the Templates page shows "Seed Built-ins". It is marked with `isBuiltIn: true`
and has `category: "audit"`, `templateType: "audit"`.

## Template Provenance

Jobs created from this template include metadata in their constraints:
```json
{
  "_sourceTemplateId": 1,
  "_sourceTemplateName": "Audit Job"
}
```
