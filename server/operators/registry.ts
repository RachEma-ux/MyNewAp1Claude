/**
 * Operator Registry — Central registry of all operators
 */

import type { OperatorName } from "@shared/operator-types";
import type { BaseOperator } from "./base-operator";
import { builderOperator } from "./builder-operator";
import { auditorOperator } from "./auditor-operator";
import { governanceOperator } from "./governance-operator";
import { deployOperator } from "./deploy-operator";

const operators = new Map<OperatorName, BaseOperator>();

operators.set("builder", builderOperator);
operators.set("auditor", auditorOperator);
operators.set("governance", governanceOperator);
operators.set("deploy", deployOperator);

export function getOperator(name: OperatorName): BaseOperator {
  const op = operators.get(name);
  if (!op) {
    throw new Error(`Unknown operator: ${name}`);
  }
  return op;
}

export function getAllOperatorNames(): OperatorName[] {
  return Array.from(operators.keys());
}
