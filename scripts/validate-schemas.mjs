import fs from "node:fs";
import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true });

function validate(schemaPath, samplePath) {
  const schema = JSON.parse(fs.readFileSync(schemaPath));
  const sample = JSON.parse(fs.readFileSync(samplePath));
  const validate = ajv.compile(schema);
  if (!validate(sample)) {
    console.error(validate.errors);
    process.exit(1);
  }
}

validate(
  "Template/Shell/workspace-template.schema.json",
  "Template/Shell/fixtures/workspace-template.example.json"
);

console.log("Schema validation passed.");
