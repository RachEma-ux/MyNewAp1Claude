# HR Role Definition Implementation

## Data Model

### Tables

| Table | Purpose |
|---|---|
| `hr_role_definitions` | Stable identity record for each role definition |
| `hr_role_definition_versions` | Effective-dated, versioned content records |
| `hr_role_definition_reviews` | Review/approval audit trail |
| `hr_position_role_links` | Position → Role Definition binding |

### Entity Separation

- **Role Definition** — canonical description of a role's purpose, outcomes, authority, boundaries, requirements
- **Position** — staffed/unstaffed seat referencing a role definition via `hr_position_role_links`
- **Worker/Employee** — occupies a position; never stores role-definition content directly
- **Permission** — derived through platform security model; not granted by role definition

## Lifecycle

```
draft → in_review → approved → published → effective → superseded
                  ↓                                     → retired
            changes_requested → in_review (resubmit)
```

### Transition Rules

- Only `draft` and `changes_requested` versions are editable
- Only `in_review` versions can be approved or sent back for changes
- Only `approved` versions can be published
- Publishing supersedes the previous effective version non-destructively
- Future effective dates create `published` status; past/current dates create `effective` status
- Retired role definitions cannot accept new position links
- Historical versions remain readable

## Visibility Model

### Classes

| Class | Access |
|---|---|
| `public_internal` | Broad internal visibility |
| `team_visible` | Team and management |
| `manager_visible` | Manager and above |
| `hr_restricted` | HR and approved reviewers |
| `admin_restricted` | Admin and technical operators |
| `confidential_case` | Explicit case-based access only |

### Masking

- **Employee**: restricted fields + manager-only fields masked
- **Manager**: restricted fields masked, manager fields visible
- **HRBP/Admin**: all fields visible

### Restricted Fields

`compensationNotes`, `successionNotes`, `restructuringNotes`, `sensitivityNotes`, `complianceNotes`, `sodConstraints`

## API Surface

All procedures under `hr.roleDefinitions.*`:

### Queries
- `list` — paginated, filtered list
- `getById` — single role def with current version (masked)
- `getVersion` — specific version (masked, audited for sensitive)
- `listVersions` — version history
- `compareVersions` — side-by-side diff
- `search` — text search
- `reviewQueue` — versions pending review
- `listPositionLinks` — linked positions
- `listReviews` — review audit trail

### Mutations
- `createDraft` — new role definition with initial draft
- `updateDraft` — edit draft/changes_requested version
- `createNewVersion` — new version based on current
- `submitForReview` — draft → in_review
- `requestChanges` — in_review → changes_requested
- `approve` — in_review → approved (with self-approval prevention)
- `publish` — approved → published/effective
- `retire` — retire role definition (blocked if active position links)
- `linkPosition` — link position to active role definition
- `unlinkPosition` — remove position link

## Integration Points

- **Positions** → reference role definitions via `hr_position_role_links`
- **Recruiting** → consumes positions which reference role definitions
- **Performance** → role-level KPIs via `successMetrics` field
- **Staffing** → workspace assignments reference positions
- **Analytics** → role definitions are queryable for workforce reporting

## UI Routes

| Route | Page | Permission |
|---|---|---|
| `/hr/role-definitions` | List page | `hr.roledef.read` |
| `/hr/role-definitions/new` | Create draft | `hr.roledef.draft` |
| `/hr/role-definitions/review` | Review queue | `hr.roledef.review` |
| `/hr/role-definitions/:id` | Detail page | `hr.roledef.read` |
| `/hr/role-definitions/:id/edit` | Edit draft | `hr.roledef.draft` |
| `/hr/role-definitions/:id/compare` | Version compare | `hr.roledef.read` |
