/**
 * Tree-sitter emitter — production code-graph parsing primitive.
 *
 * Sole tree-sitter callsite in production (the other is
 * `spike/parse-ts-file.ts`, which is the frozen T-E measurement
 * reference). T-G.2.2 graduates the spike emitter's logic to
 * production:
 *
 *   - Emits canonical lower-snake-case typeKeys (`file`, `class`,
 *     `function`, `api_endpoint` / `imports`, `calls`, `declares`)
 *     per `contracts/code-intelligence-contracts.ts`. The spike
 *     used PascalCase / SCREAMING_SNAKE_CASE (`File`, `DECLARES`)
 *     which the production taxonomy doesn't include.
 *   - Drops the spike's `EXPORTS` edge kind (not in the production
 *     10-edge closed taxonomy).
 *   - Returns `ParsedCodeNode[]` + `ParsedCodeEdge[]` matching the
 *     T-G.2.1 contract surface.
 *
 * Same shape decisions as the spike (preserved for traceability):
 *   - Only top-level declarations become nodes (nested function
 *     scopes are out of scope — Phase 25 handles them).
 *   - Call-edges record callee names only; cross-file resolution
 *     is the persistence layer's job (T-G.2.3) — keeps the
 *     emitter trivially unit-testable on inline source strings.
 *   - tRPC api-endpoint detection by regex on function body
 *     (`/Procedure\s*\.\s*(input|mutation|query)/`).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - This is the only production file in `services/code-graph/`
 *     that imports `tree-sitter`. Source-scan tested.
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 */

import Parser, { type SyntaxNode } from "tree-sitter";
import TypeScript from "tree-sitter-typescript";

import type {
  ParsedCodeNode,
  ParsedCodeEdge,
} from "./code-graph-parser.js";

const TRPC_PROCEDURE_REGEX = /Procedure\s*\.\s*(input|mutation|query)\b/;

export interface TreeSitterEmitResult {
  readonly nodes: ParsedCodeNode[];
  readonly edges: ParsedCodeEdge[];
}

/**
 * Parse + emit. Throws on parser-internal failures (caller wraps
 * in try/catch and surfaces as `ParseError`).
 */
export function emitFromTypeScriptSource(
  filePath: string,
  source: string,
): TreeSitterEmitResult {
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript);
  const tree = parser.parse(source);

  const nodes: ParsedCodeNode[] = [];
  const edges: ParsedCodeEdge[] = [];

  const fileId = `file:${filePath}`;
  nodes.push({
    id: fileId,
    typeKey: "file",
    name: filePath.split("/").pop() ?? filePath,
    filePath,
    properties: { byteLength: source.length },
  });

  walkTopLevel(tree.rootNode, fileId, filePath, source, nodes, edges);

  return { nodes, edges };
}

function walkTopLevel(
  rootNode: SyntaxNode,
  fileId: string,
  filePath: string,
  source: string,
  nodes: ParsedCodeNode[],
  edges: ParsedCodeEdge[],
): void {
  for (let i = 0; i < rootNode.namedChildCount; i++) {
    const child = rootNode.namedChild(i);
    if (!child) continue;

    switch (child.type) {
      case "import_statement":
        collectImport(child, fileId, edges);
        break;
      case "export_statement":
        collectExport(child, fileId, filePath, source, nodes, edges);
        break;
      case "class_declaration":
        collectClass(child, fileId, filePath, nodes, edges);
        break;
      case "function_declaration":
        collectFunction(child, fileId, filePath, source, nodes, edges);
        break;
      case "lexical_declaration":
      case "variable_declaration":
        collectArrowFunctionConst(child, fileId, filePath, source, nodes, edges);
        break;
      default:
        break;
    }
  }
}

function collectImport(
  node: SyntaxNode,
  fileId: string,
  edges: ParsedCodeEdge[],
): void {
  const sourceNode = node.descendantsOfType("string")[0];
  if (!sourceNode) return;
  const raw = sourceNode.text;
  const specifier = raw.slice(1, -1);
  // Target id is the raw import specifier — the orchestrator
  // (persistence layer) normalizes + joins to a `file:` id when
  // the imported file is also in the batch.
  edges.push({
    id: `${fileId}::imports::${specifier}`,
    sourceId: fileId,
    edgeTypeKey: "imports",
    targetId: specifier,
    properties: { rawSpecifier: specifier },
  });
}

function collectExport(
  node: SyntaxNode,
  fileId: string,
  filePath: string,
  source: string,
  nodes: ParsedCodeNode[],
  edges: ParsedCodeEdge[],
): void {
  // Export statements wrap class/function/const declarations; we
  // recurse to collect the inner declaration. The spike's separate
  // EXPORTS edge type isn't in the production taxonomy, so we only
  // capture the inner `declares` edge.
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    if (child.type === "class_declaration") {
      collectClass(child, fileId, filePath, nodes, edges);
    } else if (child.type === "function_declaration") {
      collectFunction(child, fileId, filePath, source, nodes, edges);
    } else if (
      child.type === "lexical_declaration" ||
      child.type === "variable_declaration"
    ) {
      collectArrowFunctionConst(child, fileId, filePath, source, nodes, edges);
    }
  }
}

function collectClass(
  node: SyntaxNode,
  fileId: string,
  filePath: string,
  nodes: ParsedCodeNode[],
  edges: ParsedCodeEdge[],
): string | null {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return null;
  const name = nameNode.text;
  const classId = `class:${filePath}::${name}`;
  nodes.push({
    id: classId,
    typeKey: "class",
    name,
    filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
  });
  edges.push({
    id: `${fileId}::declares::${classId}`,
    sourceId: fileId,
    edgeTypeKey: "declares",
    targetId: classId,
  });
  return classId;
}

function collectFunction(
  node: SyntaxNode,
  fileId: string,
  filePath: string,
  source: string,
  nodes: ParsedCodeNode[],
  edges: ParsedCodeEdge[],
): string | null {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return null;
  const name = nameNode.text;
  const bodyNode = node.childForFieldName("body");
  const bodyText = bodyNode
    ? source.slice(bodyNode.startIndex, bodyNode.endIndex)
    : "";
  const typeKey: "function" | "api_endpoint" =
    TRPC_PROCEDURE_REGEX.test(bodyText) ? "api_endpoint" : "function";
  const fnId = `${typeKey}:${filePath}::${name}`;
  nodes.push({
    id: fnId,
    typeKey,
    name,
    filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
  });
  edges.push({
    id: `${fileId}::declares::${fnId}`,
    sourceId: fileId,
    edgeTypeKey: "declares",
    targetId: fnId,
  });
  if (bodyNode) collectCalls(bodyNode, fnId, edges);
  return fnId;
}

function collectArrowFunctionConst(
  node: SyntaxNode,
  fileId: string,
  filePath: string,
  source: string,
  nodes: ParsedCodeNode[],
  edges: ParsedCodeEdge[],
): readonly string[] {
  const ids: string[] = [];
  const declarators = node.descendantsOfType("variable_declarator");
  for (const decl of declarators) {
    const nameNode = decl.childForFieldName("name");
    const valueNode = decl.childForFieldName("value");
    if (!nameNode || !valueNode) continue;
    if (
      valueNode.type !== "arrow_function" &&
      valueNode.type !== "function_expression" &&
      valueNode.type !== "function"
    ) {
      continue;
    }
    const name = nameNode.text;
    const bodyText = source.slice(valueNode.startIndex, valueNode.endIndex);
    const typeKey: "function" | "api_endpoint" =
      TRPC_PROCEDURE_REGEX.test(bodyText) ? "api_endpoint" : "function";
    const fnId = `${typeKey}:${filePath}::${name}`;
    nodes.push({
      id: fnId,
      typeKey,
      name,
      filePath,
      startLine: valueNode.startPosition.row + 1,
      endLine: valueNode.endPosition.row + 1,
    });
    edges.push({
      id: `${fileId}::declares::${fnId}`,
      sourceId: fileId,
      edgeTypeKey: "declares",
      targetId: fnId,
    });
    collectCalls(valueNode, fnId, edges);
    ids.push(fnId);
  }
  return ids;
}

function collectCalls(
  bodyNode: SyntaxNode,
  enclosingFnId: string,
  edges: ParsedCodeEdge[],
): void {
  const calls = bodyNode.descendantsOfType("call_expression");
  for (const call of calls) {
    const fn = call.childForFieldName("function");
    if (!fn) continue;
    let calleeName: string | null = null;
    if (fn.type === "identifier") calleeName = fn.text;
    else if (fn.type === "member_expression") {
      const prop = fn.childForFieldName("property");
      if (prop) calleeName = prop.text;
    }
    if (!calleeName) continue;
    edges.push({
      id: `${enclosingFnId}::calls::${calleeName}::${call.startIndex}`,
      sourceId: enclosingFnId,
      edgeTypeKey: "calls",
      targetId: calleeName,
      properties: { rawCalleeName: calleeName },
    });
  }
}
