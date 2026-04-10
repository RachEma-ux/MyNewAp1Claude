/**
 * Port: LLM — abstract interface for language model calls.
 * Used for NL→query translation, answer synthesis, entity extraction.
 */
export interface LlmCompletionRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json";
}

export interface LlmCompletionResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
  finishReason?: string;
}

export interface LlmPort {
  /** Generate a text completion */
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;

  /** Generate embeddings for text */
  embed(texts: string[]): Promise<number[][]>;
}
