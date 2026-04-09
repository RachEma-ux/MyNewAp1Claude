/**
 * AI Agent Studio — Direct OpenAI Runtime Adapter
 *
 * Phase 19 follow-up: lets the simulation engine call OpenAI directly
 * without needing a separate openllm-agent2 WebSocket bridge running
 * on localhost:5000.
 *
 * When does this kick in?
 *   - toggles.mockedTools is FALSE (user wants live inference)
 *   - providerConfig.provider === "openai"
 *   - No explicit providerConfig.baseUrl and no OPENLLM_AGENT_URL env
 *     (i.e., the user hasn't opted into openllm-agent2)
 *   - resolveProviderApiKey returns a valid key (from env or literal)
 *
 * The simulation engine prefers this direct path over the WS path for
 * openai+default because it has fewer dependencies: no external
 * process, no WebSocket handshake, no tunnel configuration. Users can
 * just set OPENAI_API_KEY in their env and hit Run.
 *
 * The WS path (runViaOpenllmAgent) is still preferred when the user
 * configures providerConfig.baseUrl or sets OPENLLM_AGENT_URL — those
 * signals mean "I have my own runtime, use that." The WS path also
 * supports MCP tool injection via Phase 18's configure_session, which
 * this direct path does NOT.
 *
 * This adapter is INTENTIONALLY minimal:
 *   - Single-turn completion (no multi-step agent loop)
 *   - No tool calls (the agent's MCP tools aren't exposed to OpenAI;
 *     that requires the openllm-agent2 tool-loop infrastructure)
 *   - No streaming (simulation timeline is step-based, not token-based)
 *   - Result shape matches OpenllmRuntimeResult as closely as possible
 *     so simulation.ts can treat both paths uniformly
 *
 * For full agent-loop / MCP tool use, users should still run
 * openllm-agent2 and set providerConfig.baseUrl. This adapter is the
 * "works out of the box" path for simple Q&A simulations.
 */

import { OpenAIProvider } from "../../providers/openai";
import type { Message } from "../../providers/types";
import type { OpenllmRuntimeResult, OpenllmUsage } from "./openllm-runtime-adapter";

export interface OpenAIDirectRequest {
  /** OpenAI API key (already resolved via resolveProviderApiKey) */
  apiKey: string;
  /** Model id — e.g., "gpt-4", "gpt-4o-mini", "gpt-4o" */
  model: string;
  /** System prompt — typically draft.systemInstructions */
  systemPrompt: string;
  /** User message — the scenario input */
  userMessage: string;
  /** Optional temperature (default 0.2 matches Studio's suggested default) */
  temperature?: number;
  /** Optional max output tokens */
  maxTokens?: number;
  /** Hard timeout for the whole call (default 60s) */
  timeoutMs?: number;
  /** AbortSignal — if aborted, the call is cancelled */
  signal?: AbortSignal;
}

/**
 * Run a single-turn OpenAI chat completion and return a result shaped
 * like OpenllmRuntimeResult so the simulation engine can consume it
 * uniformly alongside the openllm-agent2 WS path.
 */
export async function runViaOpenAIDirect(
  req: OpenAIDirectRequest
): Promise<OpenllmRuntimeResult> {
  const startMs = Date.now();

  // Build the OpenAI provider. We construct a fresh instance per call
  // rather than caching a global one so different API keys / models
  // don't accidentally leak between agents. Initialization is cheap
  // (no network call — that happens on generate).
  const provider = new OpenAIProvider({
    id: "agent-studio-direct",
    type: "openai",
    name: "Agent Studio Direct OpenAI",
    priority: 0,
    enabled: true,
    config: {
      apiKey: req.apiKey,
      defaultModel: req.model,
    },
  } as any);

  try {
    await provider.initialize();
  } catch (e) {
    return {
      ok: false,
      text: "",
      tokenCount: 0,
      durationMs: Date.now() - startMs,
      error: `OpenAI provider init failed: ${e instanceof Error ? e.message : String(e)}`,
      finalizedNormally: false,
      permissionEvents: [],
      policyEvents: [],
      sessionConfig: null,
    };
  }

  const messages: Message[] = [
    { role: "system", content: req.systemPrompt },
    { role: "user", content: req.userMessage },
  ];

  // Arm the timeout via the abort signal (if supplied) or a local
  // AbortController. OpenAI SDK honors AbortSignal on the client.
  const controller = new AbortController();
  const timeoutMs = req.timeoutMs ?? 60_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (req.signal) {
    if (req.signal.aborted) controller.abort();
    else req.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const result = await provider.generate({
      messages,
      model: req.model,
      temperature: req.temperature ?? 0.2,
      maxTokens: req.maxTokens,
    });

    clearTimeout(timer);

    const usage: OpenllmUsage = {
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      costMicrocents:
        result.cost != null ? Math.round(result.cost * 1_000_000) : undefined,
      raw: result.usage as unknown as Record<string, unknown>,
    };

    return {
      ok: true,
      text: result.content,
      tokenCount: result.usage.completionTokens,
      durationMs: Date.now() - startMs,
      finalizedNormally: true,
      usage,
      permissionEvents: [],
      policyEvents: [],
      sessionConfig: null,
    };
  } catch (e) {
    clearTimeout(timer);
    const aborted = (e as any)?.name === "AbortError" || controller.signal.aborted;
    return {
      ok: false,
      text: "",
      tokenCount: 0,
      durationMs: Date.now() - startMs,
      error: aborted
        ? `OpenAI call aborted after ${timeoutMs}ms`
        : e instanceof Error
          ? e.message
          : String(e),
      finalizedNormally: false,
      permissionEvents: [],
      policyEvents: [],
      sessionConfig: null,
    };
  } finally {
    // Cleanup the provider instance (releases the SDK client)
    try {
      await provider.cleanup();
    } catch {
      /* ignore */
    }
  }
}
