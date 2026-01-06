/**
 * Local Inference Engine Types
 * Defines interfaces for local model inference
 */

export type InferenceBackend = "llamacpp" | "vllm" | "ollama";
export type ComputeDevice = "cpu" | "cuda" | "metal" | "rocm";

/**
 * Model Configuration
 */
export interface ModelConfig {
  modelId: string;
  modelPath: string;
  backend: InferenceBackend;
  
  // Hardware settings
  device: ComputeDevice;
  nGpuLayers?: number; // Number of layers to offload to GPU
  nThreads?: number; // CPU threads
  
  // Context settings
  contextSize?: number; // Context window size
  batchSize?: number; // Batch size for processing
  
  // Generation parameters
  temperature?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  maxTokens?: number;
  
  // Performance
  useMemoryLock?: boolean; // Lock model in RAM
  useMmap?: boolean; // Use memory mapping
}

/**
 * Inference Request
 */
export interface InferenceRequest {
  messages: ChatMessage[];
  modelId: string;
  
  // Generation parameters (override model defaults)
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stop?: string[];
  
  // Streaming
  stream?: boolean;
}

/**
 * Chat Message
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Inference Response
 */
export interface InferenceResponse {
  id: string;
  modelId: string;
  choices: InferenceChoice[];
  usage: TokenUsage;
  created: number;
}

export interface InferenceChoice {
  index: number;
  message: ChatMessage;
  finishReason: "stop" | "length" | "error";
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Streaming Chunk
 */
export interface StreamChunk {
  id: string;
  modelId: string;
  choices: StreamChoice[];
  created: number;
}

export interface StreamChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
  };
  finishReason?: "stop" | "length" | "error";
}

/**
 * Model Info
 */
export interface ModelInfo {
  modelId: string;
  backend: InferenceBackend;
  device: ComputeDevice;
  contextSize: number;
  loaded: boolean;
  memoryUsage?: number; // MB
}

/**
 * Hardware Capabilities
 */
export interface HardwareCapabilities {
  cpu: {
    cores: number;
    threads: number;
    architecture: string;
  };
  gpu?: {
    name: string;
    vram: number; // MB
    compute: string; // CUDA version, Metal, ROCm
    available: boolean;
  }[];
  memory: {
    total: number; // MB
    available: number; // MB
  };
}

/**
 * Inference Engine Interface
 */
export interface IInferenceEngine {
  /**
   * Initialize the engine
   */
  initialize(): Promise<void>;
  
  /**
   * Load a model
   */
  loadModel(config: ModelConfig): Promise<void>;
  
  /**
   * Unload a model
   */
  unloadModel(modelId: string): Promise<void>;
  
  /**
   * Run inference
   */
  infer(request: InferenceRequest): Promise<InferenceResponse>;
  
  /**
   * Run streaming inference
   */
  inferStream(request: InferenceRequest): AsyncIterator<StreamChunk>;
  
  /**
   * Get loaded models
   */
  getLoadedModels(): ModelInfo[];
  
  /**
   * Get hardware capabilities
   */
  getHardwareCapabilities(): Promise<HardwareCapabilities>;
  
  /**
   * Shutdown the engine
   */
  shutdown(): Promise<void>;
}
