import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { handleChatStream } from './stream';
import { getProviderRegistry } from '../providers/registry';
import { OpenAIProvider } from '../providers/openai';
import type { ProviderConfig } from '../providers/types';

// Mock dependencies
vi.mock('../_core/sdk', () => ({
  sdk: {
    authenticateRequest: vi.fn(),
  },
}));

vi.mock('../providers/usage', () => ({
  trackProviderUsage: vi.fn(),
}));

describe('Chat Streaming', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let writeData: string[] = [];

  beforeEach(async () => {
    writeData = [];
    
    mockReq = {
      body: {
        providerId: 1,
        messages: [
          { role: 'user', content: 'Hello!' },
        ],
        temperature: 0.7,
        maxTokens: 100,
      },
    };

    mockRes = {
      setHeader: vi.fn(),
      write: vi.fn((data: string) => {
        writeData.push(data);
        return true;
      }),
      end: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      headersSent: false,
    };

    // Clear registry
    const registry = getProviderRegistry();
    await registry.cleanupAll();
  });

  afterEach(async () => {
    const registry = getProviderRegistry();
    await registry.cleanupAll();
  });

  it('should reject unauthenticated requests', async () => {
    const { sdk } = await import('../_core/sdk');
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(null);

    await handleChatStream(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should reject requests with missing provider', async () => {
    const { sdk } = await import('../_core/sdk');
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({
      id: 1,
      openId: 'test-user',
      name: 'Test User',
      email: 'test@example.com',
      role: 'user',
      createdAt: new Date(),
    });

    await handleChatStream(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Provider with ID 1 not found' });
  });

  it('should stream tokens from provider', async () => {
    const { sdk } = await import('../_core/sdk');
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({
      id: 1,
      openId: 'test-user',
      name: 'Test User',
      email: 'test@example.com',
      role: 'user',
      createdAt: new Date(),
    });

    // Create mock provider with streaming
    const mockConfig: ProviderConfig = {
      id: 1,
      name: 'Test Provider',
      type: 'openai',
      enabled: true,
      config: {
        apiKey: 'test-key',
        defaultModel: 'gpt-4o-mini',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Create a mock provider that implements streaming
    class MockStreamingProvider extends OpenAIProvider {
      protected async doInitialize() {
        // Skip actual OpenAI client initialization for testing
      }
      
      async *generateStream() {
        yield { content: 'Hello', isComplete: false };
        yield { content: ' ', isComplete: false };
        yield { content: 'World', isComplete: false };
        yield { content: '', isComplete: true };
      }
    }

    const provider = new MockStreamingProvider(mockConfig);
    await provider.initialize();

    const registry = getProviderRegistry();
    // Manually add to registry to bypass validation
    (registry as any).providers.set(1, provider);

    await handleChatStream(mockReq as Request, mockRes as Response);

    // Check that SSE headers were set
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');

    // Check that tokens were streamed
    const tokenEvents = writeData.filter(d => d.includes('"type":"token"'));
    expect(tokenEvents.length).toBeGreaterThan(0);

    // Check that completion event was sent
    const completeEvents = writeData.filter(d => d.includes('"type":"complete"'));
    expect(completeEvents.length).toBe(1);

    // Check that response was ended
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('should handle streaming errors gracefully', async () => {
    const { sdk } = await import('../_core/sdk');
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({
      id: 1,
      openId: 'test-user',
      name: 'Test User',
      email: 'test@example.com',
      role: 'user',
      createdAt: new Date(),
    });

    const mockConfig: ProviderConfig = {
      id: 1,
      name: 'Test Provider',
      type: 'openai',
      enabled: true,
      config: {
        apiKey: 'test-key',
        defaultModel: 'gpt-4o-mini',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Create a mock provider that throws an error
    class ErrorStreamingProvider extends OpenAIProvider {
      protected async doInitialize() {
        // Skip actual OpenAI client initialization for testing
      }
      
      async *generateStream() {
        yield { content: 'Hello', isComplete: false };
        throw new Error('Streaming failed');
      }
    }

    const provider = new ErrorStreamingProvider(mockConfig);
    await provider.initialize();

    const registry = getProviderRegistry();
    // Manually add to registry to bypass validation
    (registry as any).providers.set(1, provider);

    await handleChatStream(mockReq as Request, mockRes as Response);

    // Check that error event was sent
    const errorEvents = writeData.filter(d => d.includes('"type":"error"'));
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0]).toContain('Streaming failed');

    // Check that response was ended
    expect(mockRes.end).toHaveBeenCalled();
  });
});
