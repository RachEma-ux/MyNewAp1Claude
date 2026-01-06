/**
 * OpenAI-Compatible API Server
 * Provides OpenAI-compatible endpoints for local models
 */

import { Router } from "express";
import { llamaCppEngine } from "../inference/llamacpp-engine";
import type { InferenceRequest, InferenceResponse } from "../inference/types";

export const openaiCompatibleRouter = Router();

// Middleware to validate API key
function validateApiKey(req: any, res: any, next: any) {
  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  
  if (!apiKey) {
    return res.status(401).json({
      error: {
        message: "Missing API key",
        type: "invalid_request_error",
        code: "missing_api_key",
      },
    });
  }
  
  // In production, validate against stored API keys
  // For now, accept any key
  next();
}

/**
 * List available models
 * GET /v1/models
 */
openaiCompatibleRouter.get("/v1/models", validateApiKey, async (req, res) => {
  try {
    const models = llamaCppEngine.getLoadedModels();
    
    res.json({
      object: "list",
      data: models.map((model: any) => ({
        id: model.modelId,
        object: "model",
        created: Date.now(),
        owned_by: "local",
        permission: [],
        root: model.modelId,
        parent: null,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : "Unknown error",
        type: "server_error",
      },
    });
  }
});

/**
 * Create chat completion
 * POST /v1/chat/completions
 */
openaiCompatibleRouter.post("/v1/chat/completions", validateApiKey, async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, stream } = req.body;
    
    if (!model || !messages) {
      return res.status(400).json({
        error: {
          message: "Missing required parameters: model and messages",
          type: "invalid_request_error",
        },
      });
    }
    
    // Convert OpenAI format to internal format
    const inferenceRequest: InferenceRequest = {
      modelId: model,
      messages: messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature,
      maxTokens: max_tokens,
      stream,
    };
    
    if (stream) {
      // Streaming response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      
      const streamIterator = llamaCppEngine.inferStream(inferenceRequest);
      const iterable = { [Symbol.asyncIterator]: () => streamIterator };
      
      for await (const chunk of iterable) {
        const openaiChunk = {
          id: chunk.id,
          object: "chat.completion.chunk",
          created: chunk.created,
          model: chunk.modelId,
          choices: chunk.choices.map((choice: any) => ({
            index: choice.index,
            delta: {
              role: choice.delta.role,
              content: choice.delta.content,
            },
            finish_reason: choice.finishReason || null,
          })),
        };
        
        res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
      }
      
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      // Non-streaming response
      const response = await llamaCppEngine.infer(inferenceRequest);
      
      const openaiResponse = {
        id: response.id,
        object: "chat.completion",
        created: response.created,
        model: response.modelId,
        choices: response.choices.map((choice: any) => ({
          index: choice.index,
          message: {
            role: choice.message.role,
            content: choice.message.content,
          },
          finish_reason: choice.finishReason,
        })),
        usage: {
          prompt_tokens: response.usage.promptTokens,
          completion_tokens: response.usage.completionTokens,
          total_tokens: response.usage.totalTokens,
        },
      };
      
      res.json(openaiResponse);
    }
  } catch (error) {
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : "Unknown error",
        type: "server_error",
      },
    });
  }
});

/**
 * Create completion (legacy)
 * POST /v1/completions
 */
openaiCompatibleRouter.post("/v1/completions", validateApiKey, async (req, res) => {
  try {
    const { model, prompt, temperature, max_tokens } = req.body;
    
    if (!model || !prompt) {
      return res.status(400).json({
        error: {
          message: "Missing required parameters: model and prompt",
          type: "invalid_request_error",
        },
      });
    }
    
    // Convert to chat format
    const inferenceRequest: InferenceRequest = {
      modelId: model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature,
      maxTokens: max_tokens,
    };
    
    const response = await llamaCppEngine.infer(inferenceRequest);
    
    const openaiResponse = {
      id: response.id,
      object: "text_completion",
      created: response.created,
      model: response.modelId,
      choices: response.choices.map((choice: any) => ({
        text: choice.message.content,
        index: choice.index,
        finish_reason: choice.finishReason,
      })),
      usage: {
        prompt_tokens: response.usage.promptTokens,
        completion_tokens: response.usage.completionTokens,
        total_tokens: response.usage.totalTokens,
      },
    };
    
    res.json(openaiResponse);
  } catch (error) {
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : "Unknown error",
        type: "server_error",
      },
    });
  }
});

/**
 * Get model details
 * GET /v1/models/:model
 */
openaiCompatibleRouter.get("/v1/models/:model", validateApiKey, async (req, res) => {
  try {
    const { model } = req.params;
    const models = llamaCppEngine.getLoadedModels();
    const modelInfo = models.find((m: any) => m.modelId === model);
    
    if (!modelInfo) {
      return res.status(404).json({
        error: {
          message: `Model ${model} not found`,
          type: "invalid_request_error",
        },
      });
    }
    
    res.json({
      id: modelInfo.modelId,
      object: "model",
      created: Date.now(),
      owned_by: "local",
      permission: [],
      root: modelInfo.modelId,
      parent: null,
    });
  } catch (error) {
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : "Unknown error",
        type: "server_error",
      },
    });
  }
});
