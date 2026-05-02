/**
 * Document pipeline — parser execution with fallback chain.
 *
 * Wraps `callWorkerParse` with the routing decision's fallback chain.
 * Tries the selected processor first; on any worker error, tries each
 * fallback in order. Returns the first successful parser output, or
 * the last error if every parser failed.
 *
 * Behavior:
 *   - Worker unreachable / timeout / http_error → propagate WorkerRpcError
 *     after exhausting the chain (caller records `failed`/`degraded`).
 *   - Successful parse → returns { parserUsed, fallbackUsed, result }.
 *   - Never fakes success; never silently picks a non-listed parser.
 */

import {
  callWorkerParse,
  WorkerRpcError,
  type WorkerParseResult,
} from "../../dataAcquisition.worker";

export interface ExecutionInput {
  itemId: number;
  pipeline: string;
  selectedProcessor: string;
  fallbackChain?: string[];
  rawLocation?: string;
}

export interface ExecutionOutcome {
  parserUsed: string;
  fallbackUsed: boolean;
  attempts: Array<{ processor: string; error?: string }>;
  result: WorkerParseResult;
}

export async function executeParserChain(
  input: ExecutionInput,
): Promise<ExecutionOutcome> {
  const chain = [input.selectedProcessor, ...(input.fallbackChain ?? [])];
  const attempts: ExecutionOutcome["attempts"] = [];
  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const processor = chain[i];
    try {
      const result = await callWorkerParse({
        itemId: input.itemId,
        pipeline: input.pipeline,
        processorName: processor,
        rawLocation: input.rawLocation,
        fallbackChain: chain.slice(i + 1),
      });
      attempts.push({ processor });
      return {
        parserUsed: processor,
        fallbackUsed: i > 0,
        attempts,
        result,
      };
    } catch (err) {
      lastErr = err;
      const message =
        err instanceof WorkerRpcError ? `${err.kind}: ${err.message}` : (err as Error).message;
      attempts.push({ processor, error: message });
      // unreachable / timeout — bail out of chain, no point retrying.
      if (err instanceof WorkerRpcError && (err.kind === "unreachable" || err.kind === "timeout")) {
        throw err;
      }
    }
  }
  throw (
    lastErr ??
    new WorkerRpcError(
      "bad_response",
      `All parsers failed for item ${input.itemId} (chain: ${chain.join(" → ")})`,
    )
  );
}
