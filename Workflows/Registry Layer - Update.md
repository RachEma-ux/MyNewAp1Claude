# Registry Layer - Update

Alright — we finish the Registry Layer properly: checksums + evidence conventions + lineage rules.

---

## 1) Add canonical Evidence folder structure

Create this folder tree (empty folders are fine):

```
Template/Shell/Evidence/
  README.md
  generic.workspace/1.0.0/
    promotion-receipt.json
    validation-report.json
  personal.workspace/1.0.0/
    promotion-receipt.json
    validation-report.json
  project.workspace/1.0.0/
    promotion-receipt.json
    validation-report.json
  research.workspace/1.0.0/
    promotion-receipt.json
    validation-report.json
  gov.standard/1.0.0/
    promotion-receipt.json
    validation-report.json
  tier.standard/1.0.0/
    promotion-receipt.json
    validation-report.json
```

### Template/Shell/Evidence/README.md

```
# Evidence Store (Template Registry)

This folder contains immutable evidence artifacts referenced by `Template/Shell/templates.index.json`.

Rules:
- Evidence paths are stable and versioned: `{objectId}/{version}/...`
- Evidence is append-only. Never edit an existing version's evidence; create a new version.
- Each promotion must include:
  - promotion-receipt.json
  - validation-report.json
```

---

## 2) Evidence JSON templates (copy for each object/version)

### promotion-receipt.json (template)

```json
{
  "kind": "promotionReceipt",
  "object": {
    "kind": "workspaceTemplate",
    "id": "REPLACE_ME",
    "version": "1.0.0"
  },
  "result": "approved",
  "approval": {
    "approvedBy": "REPLACE_ME",
    "approvedAt": "2026-02-26T00:00:00Z",
    "method": "manual",
    "ticketRef": "REPLACE_ME_OPTIONAL"
  },
  "inputs": {
    "sourceCommit": "REPLACE_ME_OPTIONAL",
    "sourcePaths": [
      "REPLACE_ME"
    ]
  },
  "notes": "Promotion receipt for locked version."
}
```

### validation-report.json (template)

```json
{
  "kind": "validationReport",
  "object": {
    "kind": "workspaceTemplate",
    "id": "REPLACE_ME",
    "version": "1.0.0"
  },
  "summary": {
    "status": "pass",
    "checksTotal": 0,
    "checksPassed": 0,
    "checksFailed": 0
  },
  "checks": [],
  "artifacts": {
    "schemasValidated": [
      "Template/Shell/workspace-template.schema.json"
    ],
    "registryValidated": [
      "Template/Shell/templates.index.json"
    ]
  },
  "generatedAt": "2026-02-26T00:00:00Z"
}
```

(For governanceProfile/resourceTier objects, set "kind" accordingly.)

---

## 3) Replace sha256:REPLACE_ME automatically

Here's a Node script that:

- reads `Template/Shell/templates.index.json`
- computes SHA-256 for each referenced path in `paths`
- writes back real checksums

Save as: `Template/Shell/tools/update-registry-checksums.mjs`

```javascript
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const repoRoot = process.cwd();
const indexPath = path.join(repoRoot, "Template", "Shell", "templates.index.json");

function sha256File(absPath) {
  const buf = fs.readFileSync(absPath);
  const hash = crypto.createHash("sha256").update(buf).digest("hex");
  return `sha256:${hash}`;
}

function isString(x) {
  return typeof x === "string" && x.length > 0;
}

const indexRaw = fs.readFileSync(indexPath, "utf8");
const indexJson = JSON.parse(indexRaw);

if (!Array.isArray(indexJson.objects)) {
  throw new Error("templates.index.json missing objects[]");
}

for (const obj of indexJson.objects) {
  if (!obj.paths || typeof obj.paths !== "object") continue;

  obj.checksums = obj.checksums && typeof obj.checksums === "object" ? obj.checksums : {};

  for (const [k, relPath] of Object.entries(obj.paths)) {
    if (!isString(relPath)) continue;

    const absPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(absPath)) {
      // leave checksum as-is but mark missing
      obj.checksums[k] = obj.checksums[k] || "MISSING_FILE";
      continue;
    }
    obj.checksums[k] = sha256File(absPath);
  }
}

indexJson.generatedAt = new Date().toISOString();

fs.writeFileSync(indexPath, JSON.stringify(indexJson, null, 2) + "\n", "utf8");
console.log(`Updated checksums in: ${indexPath}`);
```

Run it from repo root:

```bash
node Template/Shell/tools/update-registry-checksums.mjs
```

---

## 4) Tighten lineage rules (add to TemplateRegistryContract.md)

Add this section (copy/paste):

```markdown
## 11. Version Lineage & Upgrade Rules (Canonical)

### 11.1 Lineage Record
Each object MAY include lineage entries:
- fromVersion
- toVersion
- breaking (boolean)
- migrationRequired (boolean)
- migrationNotes (string)

### 11.2 Breaking Change Definition
A change is BREAKING if it impacts:
- required schema fields
- default modules that remove functionality
- governance posture that increases enforcement (monitor→enforce)
- resource tier ceilings that decrease quotas
- export/integration rules that tighten access

### 11.3 Upgrade Constraints
- Auto-upgrade is allowed only when breaking=false AND migrationRequired=false.
- Otherwise, explicit admin approval is required.
```

---

## 5) Update plan status (Registry Layer)

After you add the Evidence folder + run checksum script:

- [x] TemplateRegistryContract.md
- [x] templates.index.json
- [x] Evidence folder conventions
- [x] Real sha256 checksums
- [ ] Expanded lineage records (beyond placeholder)

---

**If you say "next"**, I'll produce:

a ready-to-commit Evidence/ set for each of your current objects (generic/personal/project/research + gov.standard + tier.standard), already filled with consistent fields.
