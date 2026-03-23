# policies/

Reference-only Rego policy files. These are **not used at runtime**.

The application uses a local rule-based policy scoring engine
(`server/services/policyEvaluation.ts`) instead of an external OPA server.

These `.rego` files are kept as design references for the policy model
and may inform future policy schema evolution.
