# Code Studio — Job Templates

## Overview

Job Templates allow users to create reusable job definitions with variable placeholders.
Templates are stored in CODEDB as first-class entities owned by Code Studio.

## Data Model

Templates are stored in `code_job_templates` with these fields:

| Field | Type | Purpose |
|---|---|---|
| id | serial | Primary key |
| name | varchar(255) | Template display name |
| slug | varchar(255) | URL-safe identifier |
| description | text | What the template does |
| category | varchar(50) | Grouping (e.g., "audit", "implementation") |
| templateType | varchar(50) | Type classification |
| isBuiltIn | boolean | Built-in templates cannot be created by users |
| isActive | boolean | Soft delete flag |
| titleTemplate | text | Template for job title, supports `{{variable}}` |
| objectiveTemplate | text | Template for job objective/prompt |
| defaultPriority | varchar(20) | Default priority for generated jobs |
| defaultConstraints | jsonb | Default constraints JSON |
| variableSchema | jsonb | Array of variable definitions |

## Variable Schema

Each variable definition supports:

```json
{
  "key": "targetPrompt",
  "label": "Target prompt to audit",
  "type": "text | long_text",
  "required": true,
  "placeholder": "Hint text for the input",
  "helpText": "Optional longer description"
}
```

Supported types:
- `text` — single-line text input
- `long_text` — multiline textarea

## Template Interpolation

Templates use `{{variableKey}}` placeholders. During job creation:

1. User selects a template
2. UI renders variable inputs from `variableSchema`
3. User fills in values
4. Backend replaces `{{key}}` with user values in both `titleTemplate` and `objectiveTemplate`
5. User can review/edit the generated result before creating the job

## Import File Format

Templates can be imported from JSON or YAML files:

```json
{
  "templates": [
    {
      "name": "My Template",
      "description": "What it does",
      "category": "general",
      "titleTemplate": "Job: {{topic}}",
      "objectiveTemplate": "Implement {{topic}} with...",
      "defaultPriority": "normal",
      "variableSchema": [
        {
          "key": "topic",
          "label": "Topic",
          "type": "text",
          "required": true
        }
      ]
    }
  ]
}
```

YAML format is also accepted (`.yaml` or `.yml` extension).

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `codeStudio.templates.list` | query | List active templates |
| `codeStudio.templates.getById` | query | Get template by ID |
| `codeStudio.templates.create` | mutation | Create new template |
| `codeStudio.templates.update` | mutation | Update template |
| `codeStudio.templates.delete` | mutation | Delete template |
| `codeStudio.templates.importFile` | mutation | Import from parsed JSON |
| `codeStudio.templates.generateJobDraft` | query | Generate title/objective from template + variables |
| `codeStudio.templates.seed` | mutation | Seed built-in templates |

## New Job Flow

1. User clicks "New Job"
2. Chooses: Blank Job or Use Template
3. If template: picks template, fills variables, previews result
4. Generated title/objective are editable before creation
5. Job is created with template provenance in constraints (`_sourceTemplateId`, `_sourceTemplateName`)
