# Provider Hub Integration Plan

## Executive Summary

This document outlines the integration of Provider Hub concepts into MyNewAppV1, transforming it from a basic local AI platform into a sophisticated multi-provider orchestration system. The integration maintains the existing Node.js/TypeScript foundation while adding advanced capabilities for provider management, resource optimization, and intelligent routing.

## Architecture Overview

### Current MyNewAppV1 Architecture
```
┌─────────────────────────────────────────┐
│         React Frontend (Vite)           │
├─────────────────────────────────────────┤
│         tRPC API Layer                  │
├─────────────────────────────────────────┤
│    Express Server + Node.js Backend     │
├─────────────────────────────────────────┤
│  Database (MySQL) + S3 Storage          │
└─────────────────────────────────────────┘
```

### Integrated Provider Hub Architecture
```
┌──────────────────────────────────────────────────────────────┐
│                  React Frontend (Vite)                       │
│  ┌────────────┐ ┌────────────┐ ┌──────────────────────┐     │
│  │ Workspace  │ │ Provider   │ │   Model Management   │     │
│  │ Management │ │ Dashboard  │ │   & Monitoring       │     │
│  └────────────┘ └────────────┘ └──────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
                            │
┌──────────────────────────────────────────────────────────────┐
│                    tRPC API Gateway                          │
│  ┌────────────┐ ┌────────────┐ ┌──────────────────────┐     │
│  │ Workspace  │ │ Provider   │ │   Inference API      │     │
│  │ Routes     │ │ Routes     │ │   (OpenAI-compat)    │     │
│  └────────────┘ └────────────┘ └──────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
                            │
┌──────────────────────────────────────────────────────────────┐
│              Provider Orchestration Layer (NEW)              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │            Provider Router & Selector                  │  │
│  │  • Cost-based routing                                  │  │
│  │  • Latency optimization                                │  │
│  │  • Fallback handling                                   │  │
│  │  • Load balancing                                      │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │         Resource Manager (NEW)                         │  │
│  │  • GPU/CPU detection & monitoring                      │  │
│  │  • Memory allocation                                   │  │
│  │  • Model loading/unloading                             │  │
│  │  • Workspace quotas                                    │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                            │
┌──────────────────────────────────────────────────────────────┐
│              Provider Abstraction Layer (NEW)                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │         Unified Provider Interface                   │    │
│  │  • generate(prompt, options)                         │    │
│  │  • generateStream(prompt, options)                   │    │
│  │  • embed(texts, options)                             │    │
│  │  • getCapabilities()                                 │    │
│  │  • getCost()                                         │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │  Local   │ │  OpenAI  │ │Anthropic │ │  Google  │        │
│  │ Provider │ │ Provider │ │ Provider │ │ Provider │        │
│  │(llama.cpp│ │          │ │          │ │          │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
└──────────────────────────────────────────────────────────────┘
                            │
┌──────────────────────────────────────────────────────────────┐
│                  Inference Backends (NEW)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │llama.cpp │ │ llamafile│ │  Ollama  │ │ External │        │
│  │ (Native) │ │ (Binary) │ │  (API)   │ │  APIs    │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
└──────────────────────────────────────────────────────────────┘
                            │
┌──────────────────────────────────────────────────────────────┐
│                    Enhanced Services                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │   RAG    │ │  Vector  │ │  Agent   │ │Monitoring│        │
│  │  Engine  │ │ Database │ │  System  │ │& Metrics │        │
│  │ (Hybrid) │ │ (Qdrant) │ │ (Multi)  │ │ (Stats)  │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
└──────────────────────────────────────────────────────────────┘
                            │
┌──────────────────────────────────────────────────────────────┐
│                    Storage Layer                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │  MySQL   │ │    S3    │ │  Redis   │ │  Local   │        │
│  │(Metadata)│ │  (Files) │ │ (Cache)  │ │ (Models) │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
└──────────────────────────────────────────────────────────────┘
```

## Implementation Strategy

### Phase 1: Provider Abstraction Layer (Week 1-2)

**Goal**: Create a unified interface for all LLM providers (local and cloud).

**Components to Build**:

1. **Base Provider Interface** (`server/providers/base.ts`)
```typescript
export interface ILLMProvider {
  // Identification
  id: string;
  name: string;
  type: ProviderType;
  
  // Core methods
  generate(request: GenerationRequest): Promise<GenerationResponse>;
  generateStream(request: GenerationRequest): AsyncGenerator<Token>;
  embed(texts: string[], options?: EmbedOptions): Promise<Embedding[]>;
  
  // Metadata
  getCapabilities(): ProviderCapabilities;
  getCostPerToken(): CostProfile;
  getLatencyProfile(): LatencyProfile;
  
  // Lifecycle
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
}
```

2. **Local Provider Implementation** (`server/providers/local.ts`)
   - Wrap llama.cpp via child process or native bindings
   - Support GGUF model loading
   - GPU/CPU detection and utilization
   - Streaming token generation

3. **Cloud Provider Implementations**
   - OpenAI provider (`server/providers/openai.ts`)
   - Anthropic provider (`server/providers/anthropic.ts`)
   - Google provider (`server/providers/google.ts`)

4. **Provider Registry** (`server/providers/registry.ts`)
   - Dynamic provider registration
   - Configuration management
   - Provider discovery

**Database Schema Updates**:
```sql
CREATE TABLE providers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  type ENUM('local', 'openai', 'anthropic', 'google', 'custom') NOT NULL,
  enabled BOOLEAN DEFAULT true,
  priority INT DEFAULT 50,
  config JSON NOT NULL,
  cost_per_1k_tokens DECIMAL(10,6),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE workspace_providers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  workspace_id INT NOT NULL,
  provider_id INT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  priority INT DEFAULT 50,
  quota_tokens_per_day INT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE TABLE provider_usage (
  id INT PRIMARY KEY AUTO_INCREMENT,
  workspace_id INT NOT NULL,
  provider_id INT NOT NULL,
  model_name VARCHAR(255),
  tokens_used INT NOT NULL,
  cost DECIMAL(10,6),
  latency_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);
```

### Phase 2: Resource Management (Week 3-4)

**Goal**: Implement intelligent resource allocation and monitoring.

**Components to Build**:

1. **System Monitor** (`server/system/monitor.ts`)
   - GPU detection (CUDA, Metal, OpenCL)
   - Memory monitoring
   - CPU utilization tracking
   - Disk space monitoring

2. **Model Manager** (`server/models/manager.ts`)
   - Model loading/unloading
   - Memory estimation
   - LRU cache with prefetching
   - Quantization selection based on available memory

3. **Resource Allocator** (`server/system/allocator.ts`)
   - Request queuing
   - Priority-based scheduling
   - Workspace quota enforcement
   - Concurrent request limiting

**Key Features**:
- Automatic model unloading when memory is low
- Smart quantization selection (Q8 if RAM available, Q4 if constrained)
- Per-workspace resource limits
- Request prioritization (premium users first)

### Phase 3: Provider Router & Selector (Week 5-6)

**Goal**: Intelligent routing of requests to optimal providers.

**Components to Build**:

1. **Provider Router** (`server/providers/router.ts`)
```typescript
export class ProviderRouter {
  async selectProvider(
    request: InferenceRequest,
    workspace: Workspace
  ): Promise<ILLMProvider> {
    // 1. Filter available providers for workspace
    const available = await this.getAvailableProviders(workspace);
    
    // 2. Score each provider
    const scored = available.map(provider => ({
      provider,
      score: this.calculateScore(provider, request, workspace)
    }));
    
    // 3. Select best provider
    return this.selectBest(scored, request.strategy);
  }
  
  private calculateScore(
    provider: ILLMProvider,
    request: InferenceRequest,
    workspace: Workspace
  ): number {
    const costScore = this.scoreCost(provider, request);
    const latencyScore = this.scoreLatency(provider, request);
    const availabilityScore = this.scoreAvailability(provider);
    const qualityScore = this.scoreQuality(provider, request);
    
    // Weighted combination based on workspace preferences
    return (
      workspace.costWeight * costScore +
      workspace.latencyWeight * latencyScore +
      workspace.availabilityWeight * availabilityScore +
      workspace.qualityWeight * qualityScore
    );
  }
}
```

2. **Routing Strategies**:
   - **Cost-optimized**: Prefer cheapest provider
   - **Latency-optimized**: Prefer fastest provider
   - **Quality-optimized**: Prefer best model
   - **Balanced**: Weighted combination
   - **Fallback**: Try primary, fallback to secondary

3. **Hybrid Provider** (`server/providers/hybrid.ts`)
   - Split long prompts between local and cloud
   - Use local for system prompt, cloud for completion
   - Intelligent cost/quality tradeoffs

### Phase 4: RAG Engine Enhancement (Week 7-8)

**Goal**: Build production-grade RAG with vector search and reranking.

**Components to Build**:

1. **Vector Database Integration** (`server/rag/vector-db.ts`)
   - Integrate Qdrant (embedded mode)
   - Collection management per workspace
   - Hybrid search (dense + sparse)

2. **Embedding Pipeline** (`server/rag/embeddings.ts`)
   - Support multiple embedding models (BGE, E5, MiniLM)
   - Batch embedding generation
   - Caching for duplicate texts

3. **Document Processor** (`server/rag/processor.ts`)
   - PDF text extraction (pdf-parse)
   - DOCX parsing (mammoth)
   - Markdown, TXT, CSV support
   - Semantic chunking (sentence-transformers)
   - Fixed-size chunking with overlap
   - Recursive chunking for hierarchical docs

4. **Retrieval Engine** (`server/rag/retrieval.ts`)
   - Semantic search with embeddings
   - Keyword search (BM25)
   - Hybrid search with score fusion
   - Reranking with cross-encoder
   - Context window optimization

### Phase 5: Multi-Agent System (Week 9-10)

**Goal**: Enable complex workflows with multiple agents.

**Components to Build**:

1. **Agent Framework** (`server/agents/framework.ts`)
   - Agent lifecycle management
   - Tool calling interface
   - Memory management
   - State persistence

2. **Tool System** (`server/agents/tools.ts`)
   - Built-in tools (calculator, web search, code execution)
   - Custom tool registration
   - Tool result validation
   - Sandboxed execution

3. **Agent Orchestrator** (`server/agents/orchestrator.ts`)
   - Multi-agent coordination
   - Task delegation
   - Result aggregation
   - Workflow automation

### Phase 6: Monitoring & Analytics (Week 11-12)

**Goal**: Comprehensive observability and cost tracking.

**Components to Build**:

1. **Metrics Collector** (`server/monitoring/metrics.ts`)
   - Request/response logging
   - Token usage tracking
   - Cost calculation
   - Latency measurement
   - Error rate monitoring

2. **Analytics Dashboard** (Frontend)
   - Usage charts (tokens/day, cost/day)
   - Provider performance comparison
   - Model accuracy metrics
   - Workspace quotas visualization

3. **Alerting System** (`server/monitoring/alerts.ts`)
   - Quota warnings
   - Error rate alerts
   - Cost threshold notifications
   - Performance degradation detection

## Technology Stack Updates

### New Dependencies

**Backend**:
```json
{
  "@qdrant/js-client-rest": "^1.8.0",
  "sentence-transformers": "^0.1.0",
  "pdf-parse": "^1.1.1",
  "mammoth": "^1.6.0",
  "ioredis": "^5.3.2",
  "systeminformation": "^5.21.0",
  "@anthropic-ai/sdk": "^0.17.0",
  "@google-ai/generativelanguage": "^2.1.0",
  "llamafile": "^0.8.0"
}
```

**Frontend**:
```json
{
  "recharts": "^2.10.0",
  "react-flow-renderer": "^10.3.17"
}
```

## Migration Path

### Step 1: Add Provider Schema (Day 1)
- Create new database tables
- Run migrations
- Seed with default providers

### Step 2: Implement Base Provider (Day 2-3)
- Create interface and base class
- Implement OpenAI provider (simplest)
- Test with existing chat functionality

### Step 3: Add Provider UI (Day 4-5)
- Provider management page
- Provider configuration forms
- Usage dashboard

### Step 4: Integrate Local Provider (Day 6-10)
- Install llama.cpp or llamafile
- Implement local provider wrapper
- Add GPU detection
- Test with GGUF models

### Step 5: Add Provider Router (Day 11-15)
- Implement routing logic
- Add workspace provider assignments
- Test fallback mechanisms

### Step 6: Enhance RAG (Day 16-25)
- Integrate Qdrant
- Implement embedding pipeline
- Add semantic chunking
- Build retrieval engine

### Step 7: Build Agent System (Day 26-35)
- Create agent framework
- Implement tool system
- Add orchestration

### Step 8: Add Monitoring (Day 36-40)
- Implement metrics collection
- Build analytics dashboard
- Add alerting

## Key Differences from Original Provider Hub Blueprint

| Aspect | Original Blueprint | MyNewAppV1 Integration |
|--------|-------------------|------------------------|
| **Language** | Rust | TypeScript/Node.js |
| **Complexity** | Enterprise-grade | Pragmatic, MVP-focused |
| **Timeline** | 12 months | 8-10 weeks |
| **Scope** | Full multi-tenant SaaS | Single-user with multi-workspace |
| **Performance** | Maximum optimization | Good-enough with room to grow |
| **Extensibility** | Plugin system, WASM | TypeScript modules |

## Success Metrics

1. **Performance**: < 100ms provider selection time
2. **Cost**: 50% reduction vs. cloud-only approach
3. **Reliability**: 99.9% uptime with fallback providers
4. **Scalability**: Support 10+ concurrent inference requests
5. **Usability**: < 5 minutes to add a new provider

## Next Steps

1. Review and approve this integration plan
2. Begin Phase 1 implementation (Provider Abstraction Layer)
3. Set up CI/CD for automated testing
4. Create detailed API documentation
5. Build provider integration guides

---

**Document Version**: 1.0  
**Last Updated**: 2024-12-14  
**Author**: Manus AI
