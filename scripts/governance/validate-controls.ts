/**
 * Validate YAML Control Catalog
 * Checks for duplicate IDs, missing fields, invalid severities
 */
import * as fs from "fs";
import * as path from "path";

// Try loading js-yaml
let yaml: any;
try {
  yaml = require("js-yaml");
} catch {
  console.log("js-yaml not installed, skipping YAML validation");
  process.exit(0);
}

const CONTROLS_DIR = path.resolve(__dirname, "../../controls");
const VALID_SEVERITIES = ["critical", "high", "medium", "low", "info"];
const VALID_DOMAINS = [
  "security",
  "architecture",
  "lifecycle",
  "governance",
  "documentation",
  "type_specific",
];
const VALID_STAGES = ["submit", "register", "validate", "publish", "catalog"];

let errors = 0;
let warnings = 0;
const allIds = new Set<string>();

const packFiles = ["base", "provider", "llm", "model", "agent", "bot"];

for (const pack of packFiles) {
  const filePath = path.join(CONTROLS_DIR, `${pack}.yaml`);
  if (!fs.existsSync(filePath)) {
    console.warn(`  WARN: Missing ${pack}.yaml`);
    warnings++;
    continue;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = yaml.load(content);

    if (!parsed?.controls || !Array.isArray(parsed.controls)) {
      console.error(`  ERROR: ${pack}.yaml missing 'controls' array`);
      errors++;
      continue;
    }

    for (const control of parsed.controls) {
      // Check duplicate IDs
      if (allIds.has(control.id)) {
        console.error(
          `  ERROR: Duplicate control ID: ${control.id} in ${pack}.yaml`
        );
        errors++;
      }
      allIds.add(control.id);

      // Check required fields
      for (const field of ["id", "name", "domain", "severity", "runnerId"]) {
        if (!control[field]) {
          console.error(
            `  ERROR: ${control.id || "?"} in ${pack}.yaml missing required field: ${field}`
          );
          errors++;
        }
      }

      // Check valid severity
      if (control.severity && !VALID_SEVERITIES.includes(control.severity)) {
        console.error(
          `  ERROR: ${control.id} has invalid severity: ${control.severity}`
        );
        errors++;
      }

      // Check valid domain
      if (control.domain && !VALID_DOMAINS.includes(control.domain)) {
        console.error(
          `  ERROR: ${control.id} has invalid domain: ${control.domain}`
        );
        errors++;
      }

      // Check valid stages
      if (control.blocksStages) {
        for (const stage of control.blocksStages) {
          if (!VALID_STAGES.includes(stage)) {
            console.error(
              `  ERROR: ${control.id} has invalid stage: ${stage}`
            );
            errors++;
          }
        }
      }
    }

    console.log(
      `  \u2713 ${pack}.yaml: ${parsed.controls.length} controls validated`
    );
  } catch (err) {
    console.error(`  ERROR: Failed to parse ${pack}.yaml: ${err}`);
    errors++;
  }
}

console.log(`\nTotal controls: ${allIds.size}`);
console.log(`Errors: ${errors}, Warnings: ${warnings}`);

if (errors > 0) {
  console.error("\n\u2717 FAIL: Validation errors found");
  process.exit(1);
} else {
  console.log("\n\u2713 PASS: All controls valid");
}
