# HR Module — Runtime References

Files that remain in their original locations because they are runtime/build-critical.

| File | Location | Reason |
|---|---|---|
| HR router (main) | `server/hr/router.ts` | Runtime tRPC router |
| HR sub-routers | `server/hr/*/router.ts` | 14 sub-module routers |
| HR permissions | `server/hr/permissions.ts` | Imported by all HR routers |
| HR governance utils | `server/hr/governance-utils.ts` | resolveDataScope, preventSelfApproval, etc. |
| HR types | `server/hr/types.ts` | Shared HR type definitions |
| HR tests | `server/hr/__tests__/` | Test files |
| HR frontend pages | `client/src/pages/hr/` | Vite build tree |
| HR governance docs | `HR/GOVERNANCE_HR_COMPATIBILITY_ASSESSMENT.md` | Cross-domain reference doc |
| HR compliance audit | `HR/HR_GOVERNANCE_COMPLIANCE_AUDIT.md` | Cross-domain reference doc |
| HR module audit | `HR/HR_MODULE_AUDIT_REPORT.md` | Cross-domain reference doc |
| HR final audit | `HR/HR_FINAL_ACCEPTANCE_AUDIT.md` | Cross-domain reference doc |
| HR v7.2 re-audit | `HR/HR_V72_REAUDIT.md` | Cross-domain reference doc |
