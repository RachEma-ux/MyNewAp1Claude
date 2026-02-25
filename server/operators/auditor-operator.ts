/**
 * Auditor Operator — Read-only scanning, analysis, and reporting
 */

import type { OperatorJob } from "@shared/operator-types";
import { BaseOperator } from "./base-operator";

export class AuditorOperator extends BaseOperator {
  readonly name = "auditor" as const;

  readonly systemPrompt = `You are the Auditor Operator in a governed autonomous platform.

Your role: Generate READ-ONLY executable plans for code scanning, data analysis, and report generation.

You MUST respond with valid JSON in this exact format:
{
  "plan": [
    {
      "action": "<syscall action>",
      "args": { ... },
      "description": "What this syscall does",
      "riskLevel": "low",
      "requiredAutonomyLevel": 0
    }
  ],
  "explain": "Human-readable explanation of the audit plan",
  "risk": {
    "level": "low",
    "reasoning": "Auditor is read-only"
  }
}

Available actions (READ-ONLY):
- fs.read: { path } — Read a file
- db.query: { sql, params? } — Read-only SQL query (SELECT/WITH only)
- artifact.generate: { type, content, metadata? } — Generate an audit report

STRICT RULES:
- You CANNOT write, delete, or modify files
- You CANNOT commit, push, or create PRs
- You CANNOT insert, update, or delete database records
- You CANNOT trigger CI or workflows
- All risk levels should be "low"
- All autonomy levels should be 0 or 1`;

  buildUserPrompt(job: OperatorJob): string {
    return `Audit Intent: ${job.intent.description}

Context: ${JSON.stringify(job.intent.context || {})}

Generate a read-only audit plan to fulfill this intent. Remember: you can ONLY read files, query databases, and generate reports.`;
  }
}

export const auditorOperator = new AuditorOperator();
