# DirectoryDropdown — Reusable Employee Picker Component

> **File:** `client/src/components/DirectoryDropdown.tsx`
> **Created:** 2026-03-24
> **Status:** Live
> **Backend:** `hr.directory.list` / `hr.directory.search` (tRPC)

---

## Overview

A searchable dropdown that lists employees from the HR directory. Scope-gated on the backend so any module can safely embed it without worrying about permissions.

Designed for **cross-module use** — workspace, automation, agents, or any context needing an employee picker.

---

## Usage

```tsx
import { DirectoryDropdown } from "@/components/DirectoryDropdown";

// Basic usage
<DirectoryDropdown onSelect={(worker) => console.log(worker)} />

// With controlled value + clearable
<DirectoryDropdown
  value={assigneeId}
  onSelect={(w) => setAssigneeId(w.workerId)}
  clearable
  onClear={() => setAssigneeId(null)}
  placeholder="Assign to..."
/>

// Filtered to active employees only
<DirectoryDropdown
  onSelect={handleSelect}
  statusFilter="active"
/>
```

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSelect` | `(entry: DirectoryEntry) => void` | **required** | Called with selected employee |
| `value` | `number \| null` | `undefined` | Controlled selected worker ID |
| `placeholder` | `string` | `"Select employee..."` | Trigger text when empty |
| `statusFilter` | `string` | `undefined` | Filter by status (`active`, `on_leave`, `terminated`) |
| `workerTypeFilter` | `string` | `undefined` | Filter by type (`employee`, `contractor`, `intern`, `consultant`) |
| `clearable` | `boolean` | `false` | Show clear (X) button on selection |
| `onClear` | `() => void` | `undefined` | Called when selection is cleared |
| `disabled` | `boolean` | `false` | Disable the dropdown |
| `className` | `string` | `undefined` | Additional CSS classes for the trigger button |

---

## DirectoryEntry Type

```typescript
interface DirectoryEntry {
  workerId: number;
  displayName: string;
  primaryEmail: string;
  employeeNumber?: string | null;
  workerType: string;
  status: string;
}
```

---

## Governance Compatibility

### Scope Gating (Backend-Enforced)

The dropdown calls `hr.directory.list` and `hr.directory.search`, which apply `resolveDataScope()` on the server:

| Role | Permission | Employees Visible |
|------|-----------|-------------------|
| `employee` | `hr.directory.read.self` | Own record only |
| `manager` | `hr.directory.read.team` | Direct reports |
| `hrbp` | `hr.directory.read` | All employees |
| `admin` | `hr.directory.read` | All employees |
| `workspace_admin` | `hr.directory.read` | All employees |

### Field Masking

`maskDirectoryFields()` is applied server-side. Sensitive fields (`primaryPhone`, `notes`, `costCenter`, `legalEntity`) are masked for non-privileged users.

### No Additional Permissions Required

Consuming modules do **not** need to declare or check HR permissions. The backend handles scope and masking transparently. The component is safe to embed anywhere.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Any Module (Workspace, Automation, Agents...)  │
│                                                 │
│   <DirectoryDropdown onSelect={...} />          │
│       │                                         │
└───────┼─────────────────────────────────────────┘
        │ tRPC call
        ▼
┌─────────────────────────────────────────────────┐
│  server/hr/directory/router.ts                  │
│                                                 │
│  hr.directory.list   → resolveDataScope()       │
│  hr.directory.search → resolveDataScope()       │
│                        ↓                        │
│                  maskDirectoryFields()           │
│                        ↓                        │
│                  scope-filtered rows             │
└─────────────────────────────────────────────────┘
```

---

## Intended Consumers

| Module | Use Case |
|--------|----------|
| **Workspace** | Assign members to workspaces |
| **Automation** | Select workflow actor / approver |
| **Agents** | Delegate agent tasks to employees |
| **Chat** | Start conversation with employee |
| **Documents** | Assign document owner |
| **HR Sidebar** | Pinned "Directory" link (full page) |

---

## Related Files

| File | Role |
|------|------|
| `client/src/components/DirectoryDropdown.tsx` | The reusable component |
| `client/src/pages/hr/HRDirectoryPage.tsx` | Full directory page (table + detail panel) |
| `server/hr/directory/router.ts` | Backend tRPC router (list, search, getById) |
| `server/hr/permissions.ts` | Scope resolution + field masking |
| `client/src/components/HRSideNav.tsx` | HR sidebar with pinned Directory link |
