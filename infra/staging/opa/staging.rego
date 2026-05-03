# Staging-only OPA policy bundle.
#
# Production OPA bundles live elsewhere — this file exists so the
# PR 3 / PR 11 staging evidence chain has a real openpolicyagent/opa
# instance to query. Any decision logic that depends on a real
# production policy MUST be evaluated against the production bundle,
# not this one.
#
# The /health endpoint is provided by OPA itself; we only need to
# define a couple of evaluable decisions so Phase 11 (Security/RBAC)
# has something to assert.

package staging.health

# Trivial decision so Phase 11 can prove "OPA evaluation works"
# without depending on the real policy bundle being mounted.
default allow := false

allow if input.subject == "staging-smoke"

package staging.rbac

# Admin actor → allow.  Any other role → deny.  Staging-only.
default allow := false

allow if input.actor.role == "admin"
allow if {
    input.actor.role == "member"
    input.action.type == "read"
}
