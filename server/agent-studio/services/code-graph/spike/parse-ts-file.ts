/**
 * Code Graph Parser Spike — T-E.2 emitter.
 *
 * Single tree-sitter emitter for `.ts` files. Strict-subset of
 * Phase 25's 12+10 node/edge catalog per the spike doc §3:
 *
 *   Nodes:  Repository / File / Class / Function / ApiEndpoint
 *   Edges:  DECLARES (File→Class/Function), IMPORTS (File→File),
 *           CALLS (Function→Function), EXPORTS (File→named-export)
 *
 * This file lives under `services/code-graph/spike/**` per the
 * boundary rule from T-E.1. Tree-sitter imports outside this
 * directory tree are forbidden by `code-graph-spike-boundary.test.ts`.
 *
 * Pure-function shape: `parseTsFile(filePath, source) → CodeGraphEmit`.
 * No I/O, no global state. The orchestrator (`run-sample-ingest.ts`)
 * owns file walking + emit aggregation + cross-file resolution.
 *
 * Cross-file resolution: this emitter records imports + calls by
 * STRING NAME only (the import specifier as-written; the callee
 * identifier). Joining call-by-name to a declared function across
 * files is the orchestrator's job — keeps the emitter trivially
 * unit-testable on inline source strings.
 *
 * tRPC ApiEndpoint detection per spike doc §3:
 *   regex on function body for `/Procedure\.\s*(input|mutation|query)/`
 *   — when matched, the Function node's `type` upgrades to
 *   `ApiEndpoint`. Approximate but cheap; full procedure-handler
 *   detection requires AST resolution that T-E.3 may add.
 */

import Parser, { type SyntaxNode } from "tree-sitter";
import TypeScript from "tree-sitter-typescript";

export type CodeGraphNodeType =
  | "Repository"
  | "File"
  | "Class"
  | "Function"
  | "ApiEndpoint";

export type CodeGraphEdgeType = "DECLARES" | "IMPORTS" | "CALLS" | "EXPORTS";

export interface CodeGraphNode {
  readonly type: CodeGraphNodeType;
  readonly id: string;
  readonly label: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface CodeGraphEdge {
  readonly type: CodeGraphEdgeType;
  readonly sourceId: string;
  /**
   * `targetId` is the resolved id for File→File / Function→Function
   * edges, OR the raw import specifier / callee name for unresolved
   * references. The orchestrator joins by name at aggregation time.
   */
  readonly targetId: string;
}

export interface CodeGraphEmit {
  readonly nodes: readonly CodeGraphNode[];
  readonly edges: readonly CodeGraphEdge[];
}

const TRPC_PROCEDURE_REGEX =
  /Procedure\s*\.\s*(input|mutation|query)\b/;

/**
 * Parse a single .ts file and emit its node/edge contribution to
 * the code graph. The returned ids are LOCAL to this file's scope
 * (file id = filePath; function id = `${filePath}::${name}`); the
 * aggregator joins them when it sees cross-file references.
 */
export function parseTsFile(
  filePath: string,
  source: string,
): CodeGraphEmit {
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript);
  const tree = parser.parse(source);

  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];

  const fileId = filePath;
  nodes.push({
    type: "File",
    id: fileId,
    label: filePath.split("/").pop() ?? filePath,
    meta: { path: filePath, byteLength: source.length },
  });

  walkTopLevel(tree.rootNode, fileId, source, nodes, edges);

  return { nodes, edges };
}

/**
 * Top-level walker: scans direct children of the program node,
 * collecting class/function declarations + imports + exports. Does
 * NOT recurse into function bodies for nested declarations — Phase
 * 25 proper handles nested scopes; the spike's strict-subset draws
 * the line at module-level.
 *
 * Call-edge collection IS recursive within each function body so
 * the spike answers the §2 sample-ingest question about
 * `invokeFromExtension → dispatchMcpToolCall`.
 */
function walkTopLevel(
  rootNode: SyntaxNode,
  fileId: string,
  source: string,
  nodes: CodeGraphNode[],
  edges: CodeGraphEdge[],
): void {
  for (let i = 0; i < rootNode.namedChildCount; i++) {
    const child = rootNode.namedChild(i);
    if (!child) continue;

    switch (child.type) {
      case "import_statement":
        collectImport(child, fileId, edges);
        break;
      case "export_statement":
        collectExport(child, fileId, source, nodes, edges);
        break;
      case "class_declaration":
        collectClass(child, fileId, source, nodes, edges);
        break;
      case "function_declaration":
        collectFunction(child, fileId, source, nodes, edges);
        break;
      case "lexical_declaration":
      case "variable_declaration":
        collectArrowFunctionConst(child, fileId, source, nodes, edges);
        break;
      default:
        break;
    }
  }
}

function collectImport(
  node: SyntaxNode,
  fileId: string,
  edges: CodeGraphEdge[],
): void {
  const sourceNode = node.descendantsOfType("string")[0];
  if (!sourceNode) return;
  const raw = sourceNode.text;
  const target = raw.slice(1, -1);
  edges.push({ type: "IMPORTS", sourceId: fileId, targetId: target });
}

function collectExport(
  node: SyntaxNode,
  fileId: string,
  source: string,
  nodes: CodeGraphNode[],
  edges: CodeGraphEdge[],
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    if (child.type === "class_declaration") {
      const classId = collectClass(child, fileId, source, nodes, edges);
      if (classId)
        edges.push({ type: "EXPORTS", sourceId: fileId, targetId: classId });
    } else if (child.type === "function_declaration") {
      const fnId = collectFunction(child, fileId, source, nodes, edges);
      if (fnId)
        edges.push({ type: "EXPORTS", sourceId: fileId, targetId: fnId });
    } else if (
      child.type === "lexical_declaration" ||
      child.type === "variable_declaration"
    ) {
      const ids = collectArrowFunctionConst(child, fileId, source, nodes, edges);
      for (const id of ids) {
        edges.push({ type: "EXPORTS", sourceId: fileId, targetId: id });
      }
    } else if (child.type === "export_clause") {
      const specifiers = child.descendantsOfType("export_specifier");
      for (const spec of specifiers) {
        const name = spec.text;
        edges.push({
          type: "EXPORTS",
          sourceId: fileId,
          targetId: `${fileId}::${name}`,
        });
      }
    }
  }
}

function collectClass(
  node: SyntaxNode,
  fileId: string,
  source: string,
  nodes: CodeGraphNode[],
  edges: CodeGraphEdge[],
): string | null {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return null;
  const name = nameNode.text;
  const classId = `${fileId}::${name}`;
  nodes.push({ type: "Class", id: classId, label: name });
  edges.push({ type: "DECLARES", sourceId: fileId, targetId: classId });
  // Methods would be Function nodes under the class — Phase 25 work.
  // The spike keeps the Function-node level at file scope only.
  return classId;
}

function collectFunction(
  node: SyntaxNode,
  fileId: string,
  source: string,
  nodes: CodeGraphNode[],
  edges: CodeGraphEdge[],
): string | null {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return null;
  const name = nameNode.text;
  const fnId = `${fileId}::${name}`;
  const bodyNode = node.childForFieldName("body");
  const bodyText = bodyNode ? source.slice(bodyNode.startIndex, bodyNode.endIndex) : "";
  const nodeType: CodeGraphNodeType = TRPC_PROCEDURE_REGEX.test(bodyText)
    ? "ApiEndpoint"
    : "Function";
  nodes.push({ type: nodeType, id: fnId, label: name });
  edges.push({ type: "DECLARES", sourceId: fileId, targetId: fnId });
  if (bodyNode) collectCalls(bodyNode, fnId, edges);
  return fnId;
}

/**
 * `const foo = () => {…}` / `const foo = function () {…}` — common
 * in this codebase. Pulls them up to module-level Function nodes
 * so the call graph isn't blind to arrow-style exports.
 */
function collectArrowFunctionConst(
  node: SyntaxNode,
  fileId: string,
  source: string,
  nodes: CodeGraphNode[],
  edges: CodeGraphEdge[],
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
    const fnId = `${fileId}::${name}`;
    const bodyText = source.slice(valueNode.startIndex, valueNode.endIndex);
    const nodeType: CodeGraphNodeType = TRPC_PROCEDURE_REGEX.test(bodyText)
      ? "ApiEndpoint"
      : "Function";
    nodes.push({ type: nodeType, id: fnId, label: name });
    edges.push({ type: "DECLARES", sourceId: fileId, targetId: fnId });
    collectCalls(valueNode, fnId, edges);
    ids.push(fnId);
  }
  return ids;
}

/**
 * Walks a function body collecting `call_expression` nodes. Each
 * call emits a CALLS edge from the enclosing function to a raw
 * callee name. Cross-file resolution to declared functions happens
 * at aggregation time.
 */
function collectCalls(
  bodyNode: SyntaxNode,
  enclosingFnId: string,
  edges: CodeGraphEdge[],
): void {
  const calls = bodyNode.descendantsOfType("call_expression");
  for (const call of calls) {
    const fn = call.childForFieldName("function");
    if (!fn) continue;
    // Identifier OR member_expression — take the rightmost name in
    // the dotted chain. `dispatchMcpToolCall(x)` → "dispatchMcpToolCall".
    // `mod.foo()` → "foo" (the orchestrator can join on `mod` separately).
    let calleeName: string | null = null;
    if (fn.type === "identifier") calleeName = fn.text;
    else if (fn.type === "member_expression") {
      const prop = fn.childForFieldName("property");
      if (prop) calleeName = prop.text;
    }
    if (!calleeName) continue;
    edges.push({
      type: "CALLS",
      sourceId: enclosingFnId,
      targetId: calleeName,
    });
  }
}
