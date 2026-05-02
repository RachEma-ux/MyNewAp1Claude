# Application Wiring Inventory

Generated: 2026-05-02T13:36:45.786Z

## Summary

- Modules: **16**
- Fully wired: **10**
- Mostly wired: **6**
- Partially wired: **0**
- Declared only: **0**
- Blocked: **0**
- Average readiness score: **92**
- Blockers: **0**
- Warnings: **5**
- Missing required wires: **0**

## Module readiness

| Module | Readiness | Status | Blockers | Warnings |
|---|---:|---|---:|---:|
| PRM (prm) | 86 | mostly-wired | 0 | 0 |
| PSM (psm) | 86 | mostly-wired | 0 | 0 |
| Code Studio (codeStudio) | 98 | fully-wired | 0 | 0 |
| Agent Studio (agentStudio) | 98 | fully-wired | 0 | 1 |
| Sandbox WF (sandboxWf) | 87 | mostly-wired | 0 | 0 |
| RAG (rag) | 83 | mostly-wired | 0 | 0 |
| OpenRouter (openRouter) | 85 | mostly-wired | 0 | 1 |
| PS (ps) | 96 | fully-wired | 0 | 0 |
| HR (hr) | 100 | fully-wired | 0 | 0 |
| Organization Management (organizationManagement) | 93 | fully-wired | 0 | 0 |
| Culture Values (cultureValues) | 93 | fully-wired | 0 | 0 |
| AI Types (aiTypes) | 94 | fully-wired | 0 | 1 |
| KGRA Agent (kgraAgent) | 85 | mostly-wired | 0 | 1 |
| Communication (communication) | 94 | fully-wired | 0 | 1 |
| PM Central (pmCentral) | 96 | fully-wired | 0 | 0 |
| Data Analysis (dataAnalysis) | 95 | fully-wired | 0 | 0 |

## Wiring matrix

Status legend: ✅ wired · 🟡 partial · ⚪ declared-only · 🚫 missing/broken/blocked · — not-applicable

| Module | manifest | server-router | client-route | navigation | public-api | gateway | database | permission | governance | event | handoff | runtime | port-endpoint | agent-provider | observability | test | documentation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| prm | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ | 🚫 | 🚫 |
| psm | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ | 🚫 | 🚫 |
| codeStudio | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |
| agentStudio | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ⚪ | ✅ | ✅ | ✅ |
| sandboxWf | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | 🚫 | 🚫 |
| rag | ✅ | — | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ | 🚫 | 🚫 |
| openRouter | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ⚪ | ✅ | 🚫 | 🚫 |
| ps | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | 🚫 |
| hr | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ | ✅ | ✅ |
| organizationManagement | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ | ✅ | 🚫 |
| cultureValues | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ | ✅ | 🚫 |
| aiTypes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ⚪ | ✅ | ✅ | 🚫 |
| kgraAgent | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | ⚪ | ✅ | 🚫 | 🚫 |
| communication | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ⚪ | ✅ | ✅ | 🚫 |
| pmCentral | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | 🚫 |
| dataAnalysis | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ | ✅ | 🚫 |

## Warnings

- `agentStudio` — agent-provider: declared-only (aiTypes.catalog port consumption)
- `openRouter` — agent-provider: declared-only (aiTypes.catalog port consumption)
- `aiTypes` — agent-provider: declared-only (aiTypes.catalog port consumption)
- `kgraAgent` — agent-provider: declared-only (aiTypes.catalog port consumption)
- `communication` — agent-provider: declared-only (aiTypes.catalog port consumption)

