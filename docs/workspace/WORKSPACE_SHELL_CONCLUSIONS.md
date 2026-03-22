# Workspace Shell Design Conclusions

## Core Principle

The workspace shell should make the workspace understandable to participants, while allowing the workspace manager to select and define what is shown in each participant’s workspace view.

---

## Shell Purpose

The shell should help a participant understand:

1. The global purpose
2. Their specific mission
3. The tools at their disposal
4. The allowed resources
5. The rules and regulations of the workspace

This means the shell is not only a navigation frame. It is a context and execution frame.

---

## Design Principle

```text
The shell should make the workspace intelligible before it makes it navigable.
```

---

## Shell Awareness Model

| Shell question | What it should show |
|---|---|
| What is the global purpose? | purpose statement / workspace objective |
| What is my mission? | current user mission / assigned role / current responsibility |
| What tools do I have? | enabled modules, agents, actions, utilities |
| What resources are allowed? | available data, models, providers, documents, limits |
| What rules apply? | permissions, constraints, lifecycle state, governance notices |

---

## Shell Layers

| Shell layer | Meaning |
|---|---|
| Purpose layer | global purpose of the workspace |
| Mission layer | user-specific or role-specific objective |
| Tools layer | enabled modules and actionable tools |
| Resources layer | usable data/assets/resources |
| Rules layer | permissions, constraints, compliance, lifecycle |
| Work layer | actual content/module currently being used |

---

## System vs Manager Responsibilities

The shell has two design layers.

### 1. Fixed shell contract (system-defined)
These categories are stable and should always be part of the shell model:
- global purpose
- participant mission
- tools
- resources
- rules
- current work

### 2. Manager-defined visibility
The workspace manager selects:
- which elements are shown
- in what order
- with what emphasis
- for which participant or role

So the shell becomes:

```text
context-aware
+ role-aware
+ manager-configured
```

---

## Ownership Model

| Layer | Owner |
|---|---|
| Shell meaning / categories | system |
| Shell content visibility / arrangement | workspace manager |
| Final rendered experience | participant-specific |

---

## Manager-Configured Visibility Model

| Element | Visible to whom? | Priority |
|---|---|---|
| Global purpose | everyone | high |
| Mission | member + agent | high |
| Tools | role-dependent | medium |
| Resources | role-dependent | medium |
| Rules | everyone, but summarized differently | high |
| Governance alerts | admin/manager first | high |

---

## Participant Variants

### Manager view
Should emphasize:
- global purpose
- team mission map
- enabled tools
- resource profile
- rules/governance
- activity overview
- quick control actions

### Member view
Should emphasize:
- global purpose
- their mission
- tools they can use
- resources they can access
- relevant rules
- current work items

### Agent-facing context
Should include:
- workspace purpose
- assigned mission
- allowed tools
- allowed resources
- operational constraints

---

## Architectural Statement

```text
The shell has a stable semantic structure,
but its visible composition is manager-configurable
and participant-aware.
```

---

## Final Conclusion

The workspace shell should not be designed primarily as a navigation shell.
It should be designed as an operational awareness shell that helps participants understand:
- why they are here
- what they are supposed to do
- what they can use
- what they can access
- what constraints apply

The workspace manager should be able to shape how those elements are presented to participants without changing the core shell semantics.
