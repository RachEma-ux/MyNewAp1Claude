/**
 * Agent Execution Engine
 * Orchestrates agent conversations with tool calling and memory management
 */

import { getAgent, getConversation, addMessage, getMessages } from './db';
import { getToolRegistry } from './tools';
import { getProviderRegistry } from '../providers/registry';
import { EmbeddingService } from '../embeddings/service';
import { resolveCatalogAgentExecutionTarget } from '../catalog/execution';

// Initialize embedding service
const embeddingService = new EmbeddingService();
import type { GenerationRequest } from '../providers/types';

export interface AgentExecutionOptions {
  conversationId: number;
  userMessage: string;
  userId: number;
  workspaceId: number;
  catalogEntryId?: number;
}

export interface AgentExecutionResult {
  response: string;
  toolCalls?: Array<{
    tool: string;
    params: Record<string, any>;
    result: string;
  }>;
  retrievedChunks?: Array<{
    documentId: number;
    content: string;
    similarity: number;
  }>;
  iterations: number;
}

interface RuntimeExecutionConfig {
  agentId: number | null;
  systemPrompt: string;
  modelId?: string;
  temperature: number;
  hasDocumentAccess: boolean;
  hasToolAccess: boolean;
  allowedTools: string[];
}

async function resolveRuntimeExecutionConfig(options: AgentExecutionOptions): Promise<RuntimeExecutionConfig> {
  if (options.catalogEntryId) {
    const target = await resolveCatalogAgentExecutionTarget(options.catalogEntryId);
    const conversation = await getConversation(options.conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    if (conversation.agentId && conversation.agentId !== target.sourceAgent.id) {
      throw new Error('Conversation does not match the selected Catalog execution target');
    }

    return {
      agentId: target.sourceAgent.id,
      systemPrompt: target.executionConfig.systemPrompt,
      modelId: target.executionConfig.modelId,
      temperature: target.executionConfig.temperature,
      hasDocumentAccess: target.executionConfig.hasDocumentAccess,
      hasToolAccess: target.executionConfig.hasToolAccess,
      allowedTools: target.executionConfig.allowedTools,
    };
  }

  const conversation = await getConversation(options.conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const agent = conversation.agentId ? await getAgent(conversation.agentId) : null;

  return {
    agentId: agent?.id ?? null,
    systemPrompt: agent?.systemPrompt ?? '',
    modelId: typeof agent?.modelId === 'string' ? agent.modelId : undefined,
    temperature: parseFloat(agent?.temperature || '0.7'),
    hasDocumentAccess: agent?.hasDocumentAccess ?? false,
    hasToolAccess: agent?.hasToolAccess ?? false,
    allowedTools: Array.isArray(agent?.allowedTools) ? agent.allowedTools : [],
  };
}

/**
 * Execute an agent conversation turn
 */
export async function executeAgent(options: AgentExecutionOptions): Promise<AgentExecutionResult> {
  const { conversationId, userMessage } = options;

  // Get conversation and execution config
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const executionConfig = await resolveRuntimeExecutionConfig(options);

  // Add user message to conversation
  await addMessage({
    conversationId,
    role: 'user',
    content: userMessage,
  });

  // Get conversation history
  const history = await getMessages(conversationId);

  // Build messages for LLM
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  if (executionConfig.systemPrompt) {
    messages.push({
      role: 'system',
      content: executionConfig.systemPrompt,
    });
  }

  // Add conversation history (limit to recent messages for context window)
  const recentHistory = history.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    });
  }

  // Handle RAG if agent has document access
  let retrievedChunks: Array<{ documentId: number; content: string; similarity: number }> = [];
  if (executionConfig.hasDocumentAccess) {
    try {
      const chunks = await embeddingService.searchSimilarChunks(userMessage, 3);
      retrievedChunks = chunks.map((c: any) => ({
        documentId: c.documentId,
        content: c.content,
        similarity: c.similarity,
      }));

      if (chunks.length > 0) {
        const contextMessage = `Relevant context from documents:

${chunks.map((c: any) => c.content).join('\n\n---\n\n')}`;
        messages.push({
          role: 'system',
          content: contextMessage,
        });
      }
    } catch (error) {
      console.error('[AgentExecutor] RAG search failed:', error);
    }
  }

  // Handle tool calling if agent has tool access
  const toolCalls: Array<{ tool: string; params: Record<string, any>; result: string }> = [];
  let iterations = 0;
  const maxIterations = 10;

  if (executionConfig.hasToolAccess) {
    const toolRegistry = getToolRegistry();
    const allowedTools = executionConfig.allowedTools.length > 0 ? executionConfig.allowedTools : toolRegistry.listNames();
    const tools = toolRegistry.list().filter(t => allowedTools.includes(t.name));

    if (tools.length > 0) {
      const toolDescriptions = tools.map(t =>
        `- ${t.name}: ${t.description}
  Parameters: ${t.parameters.map(p => `${p.name} (${p.type}${p.required ? ', required' : ', optional'})`).join(', ')}`
      ).join('\n');

      messages.push({
        role: 'system',
        content: `You have access to the following tools:

${toolDescriptions}

To use a tool, respond with JSON in this format:
{"tool": "tool_name", "params": {"param1": "value1"}}

After receiving tool results, provide your final answer to the user.`,
      });
    }
  }

  // Get provider
  const providerRegistry = getProviderRegistry();
  const providers = providerRegistry.getAllProviders().filter(p => p.getCapabilities().supportsStreaming);

  if (providers.length === 0) {
    throw new Error('No providers available');
  }

  const provider = providers[0]; // Use first available provider

  // Generation loop (for tool calling)
  let response = '';
  while (iterations < maxIterations) {
    iterations++;

    const request: GenerationRequest = {
      messages,
      model: executionConfig.modelId,
      temperature: executionConfig.temperature,
      maxTokens: 2000,
      workspaceId: conversation.workspaceId,
      userId: options.userId,
    };

    const result = await provider.generate(request);
    response = result.content;

    // Check if response is a tool call
    if (executionConfig.hasToolAccess && response.trim().startsWith('{')) {
      try {
        const toolCall = JSON.parse(response.trim());

        if (toolCall.tool && toolCall.params) {
          const toolRegistry = getToolRegistry();
          const toolResult = await toolRegistry.execute(toolCall.tool, toolCall.params);

          toolCalls.push({
            tool: toolCall.tool,
            params: toolCall.params,
            result: toolResult,
          });

          // Add tool result to conversation
          messages.push({
            role: 'assistant',
            content: response,
          });
          messages.push({
            role: 'system',
            content: `Tool result:
${toolResult}

Now provide your final answer to the user based on this result.`,
          });

          continue; // Continue loop to get final response
        }
      } catch (error) {
        // Not a valid tool call JSON, treat as regular response
        break;
      }
    }

    // Regular response, exit loop
    break;
  }

  // Add assistant response to conversation
  await addMessage({
    conversationId,
    role: 'assistant',
    content: response,
    retrievedChunks: retrievedChunks.length > 0 ? retrievedChunks : undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  });

  return {
    response,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    retrievedChunks: retrievedChunks.length > 0 ? retrievedChunks : undefined,
    iterations,
  };
}

/**
 * Execute agent with streaming response
 */
export async function* executeAgentStream(options: AgentExecutionOptions): AsyncGenerator<string> {
  const { conversationId, userMessage } = options;

  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const executionConfig = await resolveRuntimeExecutionConfig(options);

  await addMessage({
    conversationId,
    role: 'user',
    content: userMessage,
  });

  const history = await getMessages(conversationId);

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  if (executionConfig.systemPrompt) {
    messages.push({
      role: 'system',
      content: executionConfig.systemPrompt,
    });
  }

  const recentHistory = history.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    });
  }

  if (executionConfig.hasDocumentAccess) {
    try {
      const chunks = await embeddingService.searchSimilarChunks(userMessage, 3);

      if (chunks.length > 0) {
        const contextMessage = `Relevant context from documents:

${chunks.map((c: any) => c.content).join('\n\n---\n\n')}`;
        messages.push({
          role: 'system',
          content: contextMessage,
        });
      }
    } catch (error) {
      console.error('[AgentExecutor] RAG search failed:', error);
    }
  }

  const providerRegistry = getProviderRegistry();
  const providers = providerRegistry.getAllProviders().filter(p => p.getCapabilities().supportsStreaming);

  if (providers.length === 0) {
    throw new Error('No providers available');
  }

  const provider = providers[0];

  const request: GenerationRequest = {
    messages,
    model: executionConfig.modelId,
    temperature: executionConfig.temperature,
    maxTokens: 2000,
    workspaceId: conversation.workspaceId,
    userId: options.userId,
  };

  let fullResponse = '';
  for await (const token of provider.generateStream(request)) {
    if (!token.isComplete) {
      fullResponse += token.content;
      yield token.content;
    }
  }

  await addMessage({
    conversationId,
    role: 'assistant',
    content: fullResponse,
  });
}
