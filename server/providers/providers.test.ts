import { describe, expect, it, beforeEach, vi } from "vitest";
import { ProviderRegistry, getProviderRegistry, resetProviderRegistry } from "./registry";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GoogleProvider } from "./google";
import type { ProviderConfig, ProviderType } from "./types";

// Mock the SDK clients
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    models: {
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          id: "test-id",
          model: "gpt-4o-mini",
          choices: [{ message: { content: "Test response" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      },
    },
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        model: "text-embedding-3-small",
      }),
    },
  })),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        id: "test-id",
        model: "claude-sonnet-4-5-20250929",
        content: [{ type: "text", text: "Test response" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    },
  })),
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => "Test response",
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
          candidates: [{ finishReason: "STOP" }],
        },
      }),
      startChat: vi.fn().mockReturnValue({
        sendMessage: vi.fn().mockResolvedValue({
          response: {
            text: () => "Test response",
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
            candidates: [{ finishReason: "STOP" }],
          },
        }),
      }),
      embedContent: vi.fn().mockResolvedValue({
        embedding: { values: [0.1, 0.2, 0.3] },
      }),
    }),
  })),
}));

function createTestConfig(type: ProviderType, id: number = 1): ProviderConfig {
  return {
    id,
    name: `Test ${type} Provider`,
    type,
    enabled: true,
    priority: 50,
    config: {
      apiKey: "test-api-key",
      defaultModel: type === "openai" ? "gpt-4o-mini" : type === "anthropic" ? "claude-sonnet-4-5-20250929" : "gemini-2.5-flash",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(async () => {
    await resetProviderRegistry();
    registry = new ProviderRegistry();
  });

  it("should register a provider successfully", async () => {
    const config = createTestConfig("openai");
    const provider = await registry.registerProvider(config);

    expect(provider).toBeDefined();
    expect(provider.id).toBe(config.id);
    expect(provider.name).toBe(config.name);
    expect(provider.type).toBe(config.type);
  });

  it("should throw error when registering duplicate provider", async () => {
    const config = createTestConfig("openai");
    await registry.registerProvider(config);

    await expect(registry.registerProvider(config)).rejects.toThrow(
      "Provider with ID 1 is already registered"
    );
  });

  it("should get provider by ID", async () => {
    const config = createTestConfig("openai");
    await registry.registerProvider(config);

    const provider = registry.getProvider(config.id);
    expect(provider).toBeDefined();
    expect(provider?.id).toBe(config.id);
  });

  it("should return undefined for non-existent provider", () => {
    const provider = registry.getProvider(999);
    expect(provider).toBeUndefined();
  });

  it("should get all providers", async () => {
    await registry.registerProvider(createTestConfig("openai", 1));
    await registry.registerProvider(createTestConfig("anthropic", 2));

    const providers = registry.getAllProviders();
    expect(providers).toHaveLength(2);
  });

  it("should get providers by type", async () => {
    await registry.registerProvider(createTestConfig("openai", 1));
    await registry.registerProvider(createTestConfig("openai", 2));
    await registry.registerProvider(createTestConfig("anthropic", 3));

    const openaiProviders = registry.getProvidersByType("openai");
    expect(openaiProviders).toHaveLength(2);

    const anthropicProviders = registry.getProvidersByType("anthropic");
    expect(anthropicProviders).toHaveLength(1);
  });

  it("should unregister a provider", async () => {
    const config = createTestConfig("openai");
    await registry.registerProvider(config);

    await registry.unregisterProvider(config.id);

    const provider = registry.getProvider(config.id);
    expect(provider).toBeUndefined();
  });

  it("should get registry stats", async () => {
    await registry.registerProvider(createTestConfig("openai", 1));
    await registry.registerProvider(createTestConfig("anthropic", 2));

    const stats = registry.getStats();
    expect(stats.totalProviders).toBe(2);
    expect(stats.providersByType.openai).toBe(1);
    expect(stats.providersByType.anthropic).toBe(1);
  });

  it("should cleanup all providers", async () => {
    await registry.registerProvider(createTestConfig("openai", 1));
    await registry.registerProvider(createTestConfig("anthropic", 2));

    await registry.cleanupAll();

    const providers = registry.getAllProviders();
    expect(providers).toHaveLength(0);
  });
});

describe("OpenAIProvider", () => {
  let provider: OpenAIProvider;

  beforeEach(async () => {
    const config = createTestConfig("openai");
    provider = new OpenAIProvider(config);
    await provider.initialize();
  });

  it("should initialize successfully", async () => {
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
  });

  it("should return correct capabilities", () => {
    const capabilities = provider.getCapabilities();
    expect(capabilities.supportsStreaming).toBe(true);
    expect(capabilities.supportsEmbedding).toBe(true);
    expect(capabilities.supportsFunctionCalling).toBe(true);
    expect(capabilities.supportsVision).toBe(true);
  });

  it("should return cost profile", () => {
    const costProfile = provider.getCostPerToken();
    expect(costProfile.inputCostPer1kTokens).toBeGreaterThanOrEqual(0);
    expect(costProfile.outputCostPer1kTokens).toBeGreaterThanOrEqual(0);
  });

  it("should generate response", async () => {
    const response = await provider.generate({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(response.content).toBe("Test response");
    expect(response.usage.totalTokens).toBe(30);
  });
});

describe("AnthropicProvider", () => {
  let provider: AnthropicProvider;

  beforeEach(async () => {
    const config = createTestConfig("anthropic");
    provider = new AnthropicProvider(config);
    await provider.initialize();
  });

  it("should return correct capabilities", () => {
    const capabilities = provider.getCapabilities();
    expect(capabilities.supportsStreaming).toBe(true);
    expect(capabilities.supportsEmbedding).toBe(false);
    expect(capabilities.supportsFunctionCalling).toBe(true);
  });

  it("should throw error for embeddings", async () => {
    await expect(provider.embed(["test"])).rejects.toThrow(
      "Anthropic does not support embeddings"
    );
  });
});

describe("GoogleProvider", () => {
  let provider: GoogleProvider;

  beforeEach(async () => {
    const config = createTestConfig("google");
    provider = new GoogleProvider(config);
    await provider.initialize();
  });

  it("should return correct capabilities", () => {
    const capabilities = provider.getCapabilities();
    expect(capabilities.supportsStreaming).toBe(true);
    expect(capabilities.supportsEmbedding).toBe(true);
    expect(capabilities.maxContextLength).toBe(1000000);
  });
});

describe("getProviderRegistry singleton", () => {
  beforeEach(async () => {
    await resetProviderRegistry();
  });

  it("should return the same instance", () => {
    const registry1 = getProviderRegistry();
    const registry2 = getProviderRegistry();
    expect(registry1).toBe(registry2);
  });

  it("should reset and create new instance", async () => {
    const registry1 = getProviderRegistry();
    await registry1.registerProvider(createTestConfig("openai"));

    await resetProviderRegistry();

    const registry2 = getProviderRegistry();
    expect(registry2.getAllProviders()).toHaveLength(0);
  });
});
