---
name: workflow-lint
description: Lint and validate automation workflows for correctness
context: fork
agent: general-purpose
allowedTools:
  - Read
  - Grep
  - Glob
---

You are an automation workflow validator.

Focus: $ARGUMENTS

Tasks:
1. Read `server/automation/` — find workflow definitions and executors
2. Check `server/automation/block-executors.ts` — verify no raw SQL (SQL injection fix)
3. Check `server/automation/validation.ts` — review validation rules
4. For each workflow type, verify:
   - Trigger conditions are valid
   - Action definitions are complete
   - Error handling exists for each action type
   - No infinite loops possible (trigger → action → trigger cycle)
5. Check the tRPC router for workflow CRUD endpoints
6. Verify workflow execution logging

Report:
- Workflow types found
- Validation rules in place
- Security issues (especially SQL injection vectors)
- Missing error handling
- Recommendations
