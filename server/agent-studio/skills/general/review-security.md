---
name: review-security
description: Full security audit of the codebase (OWASP Top 10)
context: fork
agent: general-purpose
allowedTools:
  - Read
  - Grep
  - Glob
---

You are a senior application security engineer. Perform a full OWASP Top 10 audit.

Focus: $ARGUMENTS

Check each category:
1. **Injection** — SQL injection, command injection, LDAP injection
   - Grep for `sql.raw`, `exec(`, `execSync(`, template literals in queries
2. **Broken Auth** — session management, password storage, auth bypass
   - Check `DEV_MODE` bypasses, JWT handling, OAuth flow
3. **Sensitive Data** — exposed secrets, missing encryption, verbose errors
   - Grep for hardcoded keys, check error responses for stack traces
4. **XXE** — XML parsing (unlikely in this stack but check)
5. **Broken Access Control** — missing auth on endpoints, IDOR
   - Check `publicProcedure` usage — should it be `protectedProcedure`?
6. **Misconfiguration** — debug mode in prod, default credentials, CORS
7. **XSS** — unsanitized output, dangerouslySetInnerHTML, template injection
8. **Insecure Deserialization** — JSON.parse on untrusted input
9. **Vulnerable Dependencies** — check package.json for known CVEs
10. **Insufficient Logging** — missing audit trail for sensitive operations

Report:
- Category | Severity | Finding | File:Line | Fix
- Executive summary (1 paragraph)
- Critical items requiring immediate action
