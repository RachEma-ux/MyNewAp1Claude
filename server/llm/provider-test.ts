/**
 * Provider Connection Testing
 * Tests provider API credentials and connectivity
 */

import { getProviderCredentials } from './provider-credentials';
import * as providers from './providers';

export interface TestConnectionResult {
  success: boolean;
  message: string;
  details?: {
    latency?: number;
    models?: string[];
    error?: string;
  };
}

/**
 * Test connection to a provider
 */
export async function testProviderConnection(
  providerId: string,
  credentials: { apiKey?: string; endpoint?: string }
): Promise<TestConnectionResult> {
  const provider = providers.getProvider(providerId);

  if (!provider) {
    return {
      success: false,
      message: `Unknown provider: ${providerId}`,
    };
  }

  const startTime = Date.now();

  try {
    // Test based on provider type
    switch (providerId) {
      case 'openai':
        return await testOpenAI(credentials.apiKey!, credentials.endpoint);

      case 'anthropic':
        return await testAnthropic(credentials.apiKey!);

      case 'google':
        return await testGoogle(credentials.apiKey!);

      case 'meta':
      case 'mistral':
      case 'microsoft':
      case 'qwen':
      case 'xai':
      case 'cohere':
      case 'butterfly':
      case 'moonshot':
      case 'palantir':
      case 'perplexity':
      case 'deepseek':
        // For providers that don't require API keys or are not yet implemented
        return {
          success: true,
          message: `Provider ${provider.name} configuration saved (connection test not yet implemented)`,
          details: {
            latency: Date.now() - startTime,
          },
        };

      default:
        return {
          success: false,
          message: `Connection test not implemented for ${provider.name}`,
        };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Connection test failed: ${error.message}`,
      details: {
        error: error.message,
        latency: Date.now() - startTime,
      },
    };
  }
}

/**
 * Test OpenAI connection
 */
async function testOpenAI(apiKey: string, endpoint?: string): Promise<TestConnectionResult> {
  const startTime = Date.now();

  try {
    const baseURL = endpoint || 'https://api.openai.com/v1';

    const response = await fetch(`${baseURL}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        message: `OpenAI API error: ${response.status} ${response.statusText}`,
        details: {
          error,
          latency: Date.now() - startTime,
        },
      };
    }

    const data = await response.json();
    const models = data.data?.map((m: any) => m.id) || [];

    return {
      success: true,
      message: `Connected successfully to OpenAI (${models.length} models available)`,
      details: {
        latency: Date.now() - startTime,
        models: models.slice(0, 5), // Return first 5 models
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to connect to OpenAI: ${error.message}`,
      details: {
        error: error.message,
        latency: Date.now() - startTime,
      },
    };
  }
}

/**
 * Test Anthropic connection
 */
async function testAnthropic(apiKey: string): Promise<TestConnectionResult> {
  const startTime = Date.now();

  try {
    // Anthropic doesn't have a models endpoint, so we'll make a minimal completion request
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [
          { role: 'user', content: 'Hi' }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        message: `Anthropic API error: ${response.status} ${response.statusText}`,
        details: {
          error,
          latency: Date.now() - startTime,
        },
      };
    }

    return {
      success: true,
      message: `Connected successfully to Anthropic`,
      details: {
        latency: Date.now() - startTime,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to connect to Anthropic: ${error.message}`,
      details: {
        error: error.message,
        latency: Date.now() - startTime,
      },
    };
  }
}

/**
 * Test Google (Gemini) connection
 */
async function testGoogle(apiKey: string): Promise<TestConnectionResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        message: `Google API error: ${response.status} ${response.statusText}`,
        details: {
          error,
          latency: Date.now() - startTime,
        },
      };
    }

    const data = await response.json();
    const models = data.models?.map((m: any) => m.name) || [];

    return {
      success: true,
      message: `Connected successfully to Google (${models.length} models available)`,
      details: {
        latency: Date.now() - startTime,
        models: models.slice(0, 5),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to connect to Google: ${error.message}`,
      details: {
        error: error.message,
        latency: Date.now() - startTime,
      },
    };
  }
}
