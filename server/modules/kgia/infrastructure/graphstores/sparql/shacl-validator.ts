/**
 * SHACL Validator
 *
 * Validates RDF data against SHACL (Shapes Constraint Language) shapes.
 * Used to enforce schema constraints on query results and ingested data.
 */

export interface ShaclShape {
  targetClass: string;
  properties: Array<{
    path: string;
    datatype?: string;
    minCount?: number;
    maxCount?: number;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  }>;
}

export interface ValidationResult {
  conforms: boolean;
  violations: Array<{
    focusNode: string;
    path: string;
    constraint: string;
    message: string;
    severity: "violation" | "warning" | "info";
  }>;
}

/**
 * Validate data against SHACL shapes.
 */
export function validateAgainstShapes(
  data: Array<Record<string, unknown>>,
  shapes: ShaclShape[]
): ValidationResult {
  const violations: ValidationResult["violations"] = [];

  for (const shape of shapes) {
    for (const record of data) {
      for (const prop of shape.properties) {
        const value = record[prop.path];

        // minCount check
        if (prop.minCount && prop.minCount > 0 && (value === null || value === undefined)) {
          violations.push({
            focusNode: String(record["id"] ?? record["uri"] ?? "unknown"),
            path: prop.path,
            constraint: `sh:minCount ${prop.minCount}`,
            message: `Required property "${prop.path}" is missing`,
            severity: "violation",
          });
        }

        // datatype check
        if (prop.datatype && value !== null && value !== undefined) {
          if (!matchesDatatype(value, prop.datatype)) {
            violations.push({
              focusNode: String(record["id"] ?? "unknown"),
              path: prop.path,
              constraint: `sh:datatype ${prop.datatype}`,
              message: `Property "${prop.path}" has wrong datatype`,
              severity: "violation",
            });
          }
        }

        // pattern check
        if (prop.pattern && typeof value === "string") {
          if (!new RegExp(prop.pattern).test(value)) {
            violations.push({
              focusNode: String(record["id"] ?? "unknown"),
              path: prop.path,
              constraint: `sh:pattern "${prop.pattern}"`,
              message: `Property "${prop.path}" does not match pattern`,
              severity: "warning",
            });
          }
        }
      }
    }
  }

  return { conforms: violations.length === 0, violations };
}

function matchesDatatype(value: unknown, datatype: string): boolean {
  switch (datatype) {
    case "xsd:string": return typeof value === "string";
    case "xsd:integer": return typeof value === "number" && Number.isInteger(value);
    case "xsd:decimal":
    case "xsd:float":
    case "xsd:double": return typeof value === "number";
    case "xsd:boolean": return typeof value === "boolean";
    case "xsd:dateTime":
    case "xsd:date": return typeof value === "string" && !isNaN(Date.parse(value));
    default: return true;
  }
}
