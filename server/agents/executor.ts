/**
 * Agent Execution Engine
 * Orchestrates agent conversations with tool calling and memory management
 */

import { getAgent, getConversation, addMessage, getMessages } from './db';
import { getToolRegistry } from './tools';
import { getProviderRegistry } from '../providers/registry';
import { EmbeddingService } from '../embeddings/service';

// Initialize embedding service
const embeddingService = new EmbeddingService();
import type { GenerationRequest } from '../providers/types';

export interface AgentExecutionOptions {
  conversationId: number;
  userMessage: string;
  userId: number;
  workspaceId: number;
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

/**
 * Execute an agent conversation turn
 */
export async function executeAgent(options: AgentExecutionOptions): Promise<AgentExecutionResult> {
  const { conversationId, userMessage, userId, workspaceId } = options;

  // Get conversation and agent
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const agent = conversation.agentId ? await getAgent(conversation.agentId) : null;
  
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

  // Add system prompt if agent exists
  if (agent) {
    messages.push({
      role: 'system',
      content: agent.systemPrompt,
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
  if (agent?.hasDocumentAccess) {
    try {
      const chunks = await embeddingService.searchSimilarChunks(userMessage, 3);
      retrievedChunks = chunks.map((c: any) => ({
        documentId: c.documentId,
        content: c.content,
        similarity: c.similarity,
      }));

      if (chunks.length > 0) {
        const contextMessage = `Relevant context from documents:\n\n${chunks.map((c: any) => c.content).join('\n\n---\n\n')}`;
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
  const limits = agent?.limits as { maxIterations?: number } | null;
  const maxIterations = limits?.maxIterations || 10;

  if (agent?.hasToolAccess) {
    // Add tool instructions to system prompt
    const toolRegistry = getToolRegistry();
    const allowedTools = agent.allowedTools ? JSON.parse(agent.allowedTools as any) : toolRegistry.listNames();
    const tools = toolRegistry.list().filter(t => allowedTools.includes(t.name));

    if (tools.length > 0) {
      const toolDescriptions = tools.map(t => 
        `- ${t.name}: ${t.description}\n  Parameters: ${t.parameters.map(p => `${p.name} (${p.type}${p.required ? ', required' : ', optional'})`).join(', ')}`
      ).join('\n');

      messages.push({
        role: 'system',
        content: `You have access to the following tools:\n\n${toolDescriptions}\n\nTo use a tool, respond with JSON in this format:\n{"tool": "tool_name", "params": {"param1": "value1"}}\n\nAfter receiving tool results, provide your final answer to the user.`,
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
      temperature: parseFloat(agent?.temperature || '0.7'),
      maxTokens: 2000,
    };

    const result = await provider.generate(request);
    response = result.content;

    // Check if response is a tool call
    if (agent?.hasToolAccess && response.trim().startsWith('{')) {
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
            content: `Tool result:\n${toolResult}\n\nNow provide your final answer to the user based on this result.`,
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
  const { conversationId, userMessage, userId, workspaceId } = options;

  // Get conversation and agent
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const agent = conversation.agentId ? await getAgent(conversation.agentId) : null;
  
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

  // Add system prompt if agent exists
  if (agent) {
    messages.push({
      role: 'system',
      content: agent.systemPrompt,
    });
  }

  // Add conversation history (limit to recent messages)
  const recentHistory = history.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    });
  }

  // Handle RAG if agent has document access
  if (agent?.hasDocumentAccess) {
    try {
      const chunks = await embeddingService.searchSimilarChunks(userMessage, 3);

      if (chunks.length > 0) {
        const contextMessage = `Relevant context from documents:\n\n${chunks.map((c: any) => c.content).join('\n\n---\n\n')}`;
        messages.push({
          role: 'system',
          content: contextMessage,
        });
      }
    } catch (error) {
      console.error('[AgentExecutor] RAG search failed:', error);
    }
  }

  // Get provider
  const providerRegistry = getProviderRegistry();
  const providers = providerRegistry.getAllProviders().filter(p => p.getCapabilities().supportsStreaming);
  
  if (providers.length === 0) {
    throw new Error('No providers available');
  }

  const provider = providers[0];

  const request: GenerationRequest = {
    messages,
    temperature: parseFloat(agent?.temperature || '0.7'),
    maxTokens: 2000,
  };

  // Stream response
  let fullResponse = '';
  for await (const token of provider.generateStream(request)) {
    if (!token.isComplete) {
      fullResponse += token.content;
      yield token.content;
    }
  }

  // Save assistant response
  await addMessage({
    conversationId,
    role: 'assistant',
    content: fullResponse,
  });
}
