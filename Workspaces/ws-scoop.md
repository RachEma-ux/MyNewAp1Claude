# Workspaces — Scope

This folder defines the conceptual scope of the **Workspaces** domain.

The purpose of this folder is to describe how a workspace is understood, what it is created for, and what it can be organized around.

---

## Core Principle

A workspace is not only a named container.

A workspace must answer two different questions:

1. **Why does it exist?**
2. **What is it organized around?**

These two questions must remain distinct in the model.

---

## 1. Purpose

**Purpose** answers:

> Why does this workspace exist?

A workspace can be created to support:

- a goal
- a mission
- a project
- a team activity
- a research effort
- an operational function

Purpose expresses the reason the workspace exists.
It must not be confused with the structural factor that organizes it.

---

## 2. Creation Basis / Workspace Anchor

**Creation Basis** (also called **Workspace Anchor**) answers:

> What is this workspace organized around?

A workspace may be created:

- per project
- per employee role
- per HR position
- per company entity
- per activity
- per custom factor
- per app module
- per function

These are not all purpose types.
They are structural anchors that determine what the workspace is centered on.

---

## 3. Purpose vs Anchor

The model must keep these two concepts separate.

| Question | Meaning |
|---|---|
| **Purpose** | Why the workspace exists |
| **Creation Basis / Anchor** | What the workspace is organized around |

This separation is mandatory because a workspace may exist for one purpose while being anchored to a different organizing factor.

### Example

A workspace may:
- exist for a **research effort**
- but be organized **per function**

Or:

- exist for an **operational function**
- but be organized **per company entity**

---

## 4. Recommended Wizard Model

The workspace creation flow should eventually distinguish:

1. **Identity**
2. **Purpose**
3. **Creation Basis / Anchor**
4. **Scope Details**
5. **Actors**
6. **Activities**
7. **Needs**
8. **Configuration**

This ensures the system captures both:
- why the workspace exists
- what it is organized around

without mixing them into one ambiguous field.

---

## 5. Recommended Data Model Direction

The model should support fields such as:

- `purposeType`
- `purposeRef`
- `anchorType`
- `anchorRef`
- `anchorLabel`
- `anchorMeta`

This allows the system to represent both:
- purpose
- creation basis / anchor

cleanly and explicitly.

---

## 6. Notes on the Anchor Set

### Strong anchor types
These fit particularly well as first-class anchors:

- per project
- per company entity
- per activity
- per function
- per HR position

### Valid but requiring structure
These are valid, but should ideally use structured source data:

- per employee role
- per HR position

### Useful escape hatch
- per custom factor

### Use with caution
- per app module

`Per app module` may be supported, but it should be treated carefully because a module is usually closer to a **tooling/configuration factor** than to a true business anchor.

---

## 7. Final Scope Statement

The scope of the **Workspaces** folder is to define the workspace domain as:

- a purpose-driven working context
- with an explicit creation basis / anchor
- that can be organized around project, role, HR position, entity, activity, custom factor, module, or function
- while preserving a clear separation between **purpose** and **structural anchor**

In short:

> A workspace must define both **why it exists** and **what it is organized around**.
