# Agent Governance Module

Enterprise-grade agent governance system with sandbox/governed agents, policy-as-code, cryptographic proofs, and dual runtime modes (embedded/external orchestrator).

## Architecture

```
modules/agents/
├── types/          # Domain types and interfaces
├── adapters/       # Storage and runtime adapters
├── services/       # Core business logic
├── policies/       # OPA policy files
├── interceptors/   # Admission control interceptors
└── schemas/        # JSON schema validation
```

## Features

- **Sandbox Agents**: Contained testing environment with auto-expiry
- **Governed Agents**: Production-ready with cryptographic proofs
- **Policy-as-Code**: OPA-based policy evaluation
- **Dual Runtime**: Embedded or external orchestrator support
- **Admission Control**: Interceptor chain with fail-closed behavior
- **Hot Reload**: Zero-downtime policy updates
- **Revalidation**: Automatic agent status updates on policy changes

## Getting Started

See [AGENT_GOVERNANCE.md](/AGENT_GOVERNANCE.md) for complete documentation.
