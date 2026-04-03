# Code Studio — Results Model

## Overview

Every completed Code Studio job now produces a first-class result consisting of:
1. **Job-level result summary** — structured JSON on `code_jobs.resultSummary`
2. **Step-level outputs** — each workflow step persists its findings in `code_job_steps.output`
3. **Final report artifacts** — `final_report_markdown` + `final_report_json` in `code_artifacts`
4. **Session transcript** — OpenCode messages persisted in `code_session_messages`

## Storage (no new schema — all existing CODEDB columns)

| Data | Table | Column |
|---|---|---|
| Result summary | `code_jobs` | `result_summary` (jsonb) |
| Step outputs | `code_job_steps` | `output` (jsonb) |
| Final report MD | `code_artifacts` | `artifact_type = 'final_report_markdown'` |
| Final report JSON | `code_artifacts` | `artifact_type = 'final_report_json'` |
| Evidence bundle | `code_artifacts` | `artifact_type = 'evidence_bundle'` |
| Session messages | `code_session_messages` | `content_preview`, `role`, etc. |

## Result Summary Shape

```json
{
  "resultKind": "inspection | implementation | mixed | failure",
  "headline": "Job title",
  "finalAnswerPreview": "First 500 chars of last meaningful output",
  "diffCount": 0,
  "sessionCount": 1,
  "changedFilesCount": 0,
  "hasReport": true,
  "hasDiffs": false,
  "hasWorkspaceChanges": false,
  "finalStepCompleted": "governance_check",
  "generatedAt": "2026-04-03T..."
}
```

## Job Type Handling

| Job Type | Primary Output | Diffs Expected |
|---|---|---|
| Inspection / Analysis | Report | No |
| Implementation | Report + Diffs | Yes |
| Failed | Partial report + error | Maybe |
| Approval-blocked | Partial report | No |

## Report Generation

At job completion, the orchestrator:
1. Reads all step outputs
2. Reads diff list
3. Assembles markdown report with: objective, final answer, step summaries, diff summary
4. Persists as `final_report_markdown` artifact
5. Persists structured JSON as `final_report_json` artifact
6. Sets `resultSummary` on the job record

## API Endpoints

- `codeStudio.jobs.results` — returns resultSummary + report artifacts + step outputs
- `codeStudio.sessions.messages` — returns persisted transcript messages
- `codeStudio.artifacts.list` — returns all artifacts for a job
