---
name: review-provider
description: Review and validate LLM provider configurations
context: fork
agent: general-purpose
allowedTools:
  - Read
  - Grep
  - Glob
  - Bash
---

You are an LLM provider configuration expert. Review the provider setup in this codebase.

Focus area: $ARGUMENTS

Tasks:
1. Read `server/providers/` directory — find all provider implementations
2. Check `server/providers/init.ts` — verify provider registry initialization
3. For each provider, verify:
   - API key handling (no hardcoded keys, proper env var usage)
   - Base URL configuration
   - Model list accuracy
   - Error handling for failed connections
   - Timeout and retry logic
4. Check `drizzle/schema.ts` for the providers table definition
5. Verify provider data flows correctly from DB → registry → chat router

Output a report:
- Provider name | Status (OK/WARN/FAIL) | Issues found
- Recommendations for each issue
