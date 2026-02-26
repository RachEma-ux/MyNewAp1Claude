# Governance Glossary

Status: Canonical Terminology Reference
Version: 1.0.0

## Core Concepts

Digital HQ
: The control plane governing all workspaces.

Workspace
: A governed execution domain inside Digital HQ.

Workspace Template
: A versioned, locked blueprint used to provision workspaces.

Governance Profile
: A versioned policy posture applied to a workspace.

Resource Tier
: A versioned allocation envelope defining compute, storage, budget and limits.

Freeze
: A protective enforcement mode applied to a workspace.

Drift
: A deviation between actual state and baseline snapshot or registry contract.

Registry
: Machine-readable catalog of all templates, governance profiles and tiers.

Evidence
: Immutable artifact proving validation, approval or enforcement event.

Locked
: Immutable, provisionable state of a registry object.

Provisioning
: Deterministic process of creating a workspace from template + profile + tier.

Control Plane
: Governance, policy and enforcement layer (Digital HQ).

Execution Domain
: The runtime workspace environment.

Deny-by-default
: Controls default to blocking unless explicitly allowed.

Immutable Once Locked
: Locked objects cannot be edited without version bump.
