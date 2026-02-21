# MyNewAppV1 - System Architecture

## Executive Summary

MyNewAppV1 is a fully local, privacy-first AI development platform that combines the capabilities of AnythingLLM and LM Studio while adding 20 exclusive super-features. The platform runs entirely on the user's machine, supporting offline operation with no external dependencies.

## Core Design Principles

The architecture follows these fundamental principles to ensure a robust, scalable, and maintainable system:

**Local-First Operation**: All computation, storage, and processing occur on the user's machine. The system operates without internet connectivity once models are downloaded, ensuring complete privacy and data sovereignty.

**Modular Architecture**: The platform uses a plugin-based architecture where core functionality is separated into independent modules. This allows for easy extension, testing, and maintenance while enabling users to customize their installation.

**Performance Optimization**: The system automatically detects available hardware (CPU, GPU, RAM) and optimizes execution accordingly. Model inference uses hardware acceleration when available, falling back gracefully to CPU-only operation.

**Developer Experience**: The platform provides a modern development environment with TypeScript throughout, comprehensive type safety, and hot-reloading during development. The tRPC layer ensures end-to-end type safety from database to UI.

## System Architecture Overview

The platform consists of five major subsystems that work together to provide a complete AI development environment:

### Frontend Layer (React 19 + Tailwind 4)

The frontend provides three distinct layout modes optimized for different workflows. The **Chat Mode** offers a conversational interface for interacting with AI models, featuring message history, streaming responses, and attachment support. The **Code Mode** integrates a full-featured code editor with syntax highlighting, autosave, and version history. The **Dashboard Mode** provides system monitoring, model management, and configuration panels.

The UI layer communicates exclusively through tRPC procedures, ensuring type-safe API calls with automatic request/response validation. All state management uses React Query for caching, optimistic updates, and background synchronization.

### Backend Layer (Express 4 + tRPC 11)

The backend serves as the orchestration layer, coordinating between the database, inference engines, and vector stores. It exposes all functionality through tRPC procedures, providing a unified API surface for the frontend.

Key responsibilities include workspace management, user authentication, file processing pipelines, model lifecycle management, and plugin execution. The backend maintains no session state, relying on JWT tokens for authentication and database persistence for all state.

### Inference Engine Layer

The inference layer supports multiple backends to maximize compatibility and performance across different hardware configurations.

**llama.cpp Backend**: Provides CPU and GPU inference for GGUF models with excellent performance on consumer hardware. Supports quantized models (Q4, Q5, Q8) for reduced memory usage.

**vLLM Local Backend**: Offers optimized inference for larger models with advanced batching and KV cache management. Requires CUDA-compatible GPU for operation.

**OpenAI-Compatible API**: Exposes a local API server implementing the OpenAI specification, allowing existing tools and libraries to connect seamlessly.

### Vector Database Layer

The vector database layer handles embedding storage and semantic search operations critical for RAG functionality.

**Qdrant Embedded**: The default vector database runs in-process with no external dependencies. Provides HNSW indexing for fast approximate nearest neighbor search.

**Milvus Support**: Alternative vector database for users requiring distributed operation or advanced features. Runs as a separate service.

Both implementations support collection management, filtered search, and hybrid sparse-dense retrieval.

### Storage Layer

The storage layer manages three distinct data types with appropriate persistence strategies.

**Structured Data (PostgreSQL)**: User accounts, workspace configurations, document metadata, agent definitions, provider registrations, and system settings persist in PostgreSQL. The schema (`drizzle/schema.ts`, 2458 lines) uses Drizzle ORM for type-safe queries and migrations.

**Vector Data (Qdrant/Milvus)**: Document embeddings and semantic indices store in the vector database for efficient similarity search.

**File Data (S3-Compatible)**: Original documents, model files, and user uploads store in S3-compatible object storage. The system supports local MinIO for fully offline operation.

## Data Flow Architecture

### Document Ingestion Pipeline

When a user uploads a document, the system processes it through a multi-stage pipeline designed for maximum extraction quality and search relevance.

**Stage 1: File Parsing**: The ingestion service detects the file type and routes to the appropriate parser (PDF, DOCX, TXT, CSV, MD). Each parser extracts raw text while preserving structural metadata like headings, tables, and lists.

**Stage 2: Chunking**: The chunking engine splits the document into semantically coherent segments. The system supports three strategies: semantic chunking (using sentence embeddings to find natural boundaries), fixed-size chunking (uniform token counts with configurable overlap), and recursive chunking (hierarchical splitting that preserves document structure).

**Stage 3: Embedding**: Each chunk passes through the embedding engine, which generates dense vector representations using the selected model (BGE, MiniLM, or E5). The system batches chunks for efficient GPU utilization.

**Stage 4: Indexing**: Embeddings and metadata store in the vector database with appropriate filters for workspace isolation and access control.

### RAG Query Pipeline

When a user submits a query, the system retrieves relevant context and generates a response through a sophisticated multi-stage process.

**Stage 1: Query Embedding**: The user's question converts to a dense vector using the same embedding model as the documents.

**Stage 2: Retrieval**: The vector database performs similarity search, returning the top-k most relevant chunks. The system applies workspace filters to ensure users only access their own documents.

**Stage 3: Reranking**: A cross-encoder model reranks the retrieved chunks, improving relevance by considering query-document interaction rather than just embedding similarity.

**Stage 4: Context Assembly**: The system assembles selected chunks into a context window, respecting the model's maximum length and applying intelligent truncation when necessary.

**Stage 5: Generation**: The assembled context and user query pass to the inference engine, which streams the response back to the frontend in real-time.

## Providers and Models Catalog

The platform uses a **Unified Catalog** as the single source of truth for all model and provider information. Every UI component that needs a list of models queries the same `getUnifiedCatalog` tRPC endpoint, eliminating scattered hardcoded lists.

### Unified Catalog (`getUnifiedCatalog`)

The catalog merges two sources into a single queryable collection:

**Hub Models** — A curated static array of 13 downloadable open-weight models (`HUB_MODELS` in `server/models/download-router.ts`). Each entry carries metadata: name, display name, description, category (text/code/embedding), size, parameter count, Ollama tag, hardware requirements, license, and HuggingFace download URL. These represent models users can download and run locally.

**Provider Models** — Dynamically extracted from the `config.models` and `config.defaultModel` fields of all enabled providers in the database (`providers` table). When a user registers an OpenAI, Anthropic, Google, or Ollama provider, the models they configure automatically appear in the catalog with `isProviderModel: true` and the provider name attached.

The endpoint supports three filters: `search` (free-text across name, description, provider), `category` (text, code, embedding, all), and `source` (hub, providers, all).

### Provider Lifecycle

Providers follow a four-stage lifecycle tracked in the Catalogue dashboard:

| Stage | Definition | Data Source |
|---|---|---|
| **Available** | Known provider integrations the platform supports | `trpc.llm.listProviders` (static registry of supported types: Ollama, OpenAI, Anthropic, Google, llama.cpp, custom) |
| **Configured** | Providers the user has registered with credentials/endpoints | `trpc.providers.list` (rows in the `providers` DB table) |
| **Active** | Configured providers currently healthy and serving requests | Coming soon (health check integration) |
| **Offline** | Configured providers that failed their last health check | Coming soon |

### Model Lifecycle

Models follow a five-stage lifecycle:

| Stage | Definition | Data Source |
|---|---|---|
| **Downloadable** | Models in the hub catalog available for download | `getUnifiedCatalog` filtered to `!isProviderModel` (the 13 HUB_MODELS entries) |
| **Available** | Models that have been downloaded and are ready for installation | `trpc.modelDownloads.getAll` filtered to `status === "completed"` |
| **Active** | Models currently installed and loaded for inference | `trpc.models.list` (rows in the `models` DB table with status "ready") |
| **Deprecated** | Models marked for removal (end-of-life) | Coming soon |

### Catalogue Page (`LLMCataloguePage.tsx`)

The `/llm/catalogue` page renders the full unified catalog with:

- **Stats Dashboard** — Two rows of 4 cards each. Row 1 (Providers): Available, Configured, Active, Offline. Row 2 (Models): Downloadable, Available, Active, Deprecated. Cards with no data show "Coming soon".
- **Search and Filter** — Free-text search, category dropdown (All/Text/Code/Embedding), source dropdown (All/Hub/Provider).
- **Model Grid** — Cards showing model name, description, category badge, parameter count, size, and source badge (Hub vs Provider with provider name).

### Consumer Pages

All client pages that need model lists consume the unified catalog:

| Page | Usage |
|---|---|
| `LLMCataloguePage.tsx` | Full catalog browse with search, filters, and stats |
| `Providers.tsx` | Model dropdown in provider configuration |
| `ProviderDetail.tsx` | Available models list for a specific provider |
| `AgentEditor.tsx` | Model selection in agent configuration |
| `BlockConfigModal.tsx` | Model selection in automation workflow blocks |

### Policy Engine Integration

The LLM Policy Engine (`server/policies/llm-policy-engine.ts`) validates model access dynamically rather than using a static allowlist. When a model is referenced in an LLM configuration, the engine checks whether it belongs to an enabled provider in the database via `getEnabledProviders()`. In sandbox mode, all models are allowed. This means registering a new provider automatically expands the set of allowed models with no code changes.

### Provider Routing

The Hybrid Provider Router (`server/inference/hybrid-router.ts`) scores and selects the best provider for each inference request using configurable strategies: cost, latency, quality, availability, policy, or custom. Quality scoring uses a `MODEL_QUALITY_TIERS` data structure that maps model name patterns to tier scores. The router supports local-preference bias, resource-aware load balancing, cost budgets, and automatic fallback when a provider fails.

### Key Files

| File | Role |
|---|---|
| `server/models/download-router.ts` | `HUB_MODELS` array + `getUnifiedCatalog` / `getCatalog` / `addToCatalog` endpoints |
| `server/providers/router.ts` | Provider CRUD (create, update, delete, list, health check) |
| `server/providers/db.ts` | Provider database operations (`getEnabledProviders`, `getAllProviders`, etc.) |
| `server/policies/llm-policy-engine.ts` | Dynamic model allowlist via provider DB check |
| `server/inference/hybrid-router.ts` | Multi-provider routing with `MODEL_QUALITY_TIERS` |
| `server/_core/llm.ts` | Core `invokeLLM()` with configurable model (`params.model` / `DEFAULT_LLM_MODEL` env / fallback) |
| `client/src/pages/LLMCataloguePage.tsx` | Catalogue UI with stats dashboard |

## Model Download and Serving

### Model Discovery and Download

The model browser connects to HuggingFace and other model repositories via the hub catalog, presenting a searchable list with filtering by size, quantization, and task type. Users can preview model cards, view performance benchmarks, and check hardware compatibility before downloading.

The download manager (`server/models/download-service.ts`) implements resumable downloads with progress tracking, priority scheduling, bandwidth throttling, and pause/resume/cancel controls. Download status is tracked in the database via `server/models/download-db.ts`.

### Model Conversion and Quantization

The GGUF toolchain converts models from various formats (PyTorch, SafeTensors) to the optimized GGUF format. Users can select quantization levels (Q4_0, Q4_1, Q5_0, Q5_1, Q8_0) to balance quality and resource usage.

Conversion runs as a background job with progress reporting. The system validates converted models by running test inferences before marking them as ready for use.

### Model Serving

The inference engine loads models on-demand, caching frequently used models in memory. The system supports hot-swapping between models without restarting the server, enabling rapid experimentation.

Performance monitoring tracks tokens per second, memory usage, and cache hit rates. Users can view real-time metrics and historical performance data through the dashboard.

## Workspace and Multi-User System

The workspace system provides logical isolation for different projects while sharing underlying infrastructure.

Each workspace maintains its own document collection, agent configurations, and conversation history. Users can create unlimited workspaces, each with independent settings for embedding models, chunking strategies, and retrieval parameters.

The permission system supports role-based access control with three levels: owner (full control), editor (can modify content), and viewer (read-only access). Workspace owners can invite collaborators and manage permissions through the UI.

## Agent System Architecture

The agent system enables autonomous AI workflows through a flexible execution framework.

### Agent Definition

Each agent consists of a system prompt, tool access permissions, and execution parameters. Agents can access the document store, invoke external tools through the plugin system, and maintain conversation state across multiple turns.

The agent configuration UI provides templates for common patterns (research assistant, code reviewer, data analyst) while allowing full customization for advanced users.

### Multi-Agent Orchestration

The orchestration system coordinates multiple agents working on complex tasks. Agents communicate through a message bus, enabling delegation, collaboration, and parallel execution.

Users define workflows as directed acyclic graphs where nodes represent agents and edges represent data flow. The execution engine schedules agents based on dependencies and resource availability.

## Plugin System and Custom Tools SDK

The plugin system allows users to extend the platform with custom functionality without modifying core code.

### Plugin Architecture

Plugins run in isolated sandboxes with controlled access to system resources. Each plugin declares required permissions (file access, network, database) in a manifest file.

The plugin runtime supports Python and JavaScript/Node.js, providing language-specific SDKs with type definitions and helper functions. Plugins can register new tools for agents, add custom document parsers, or implement novel retrieval strategies.

### Tool Registration

Tools registered by plugins become available to agents through a unified interface. Each tool specifies input/output schemas using JSON Schema, enabling automatic validation and UI generation.

The system provides built-in tools for common operations (web search, file operations, data transformation) while allowing unlimited custom extensions.

## Automation and Task Scheduling

The automation engine enables users to create workflows triggered by time, events, or webhooks.

### Trigger System

**Time-Based Triggers**: Cron expressions schedule recurring tasks (daily summaries, periodic data ingestion, scheduled model updates).

**Event-Based Triggers**: System events (document uploaded, model downloaded, agent completed) can trigger automated workflows.

**Webhook Triggers**: External systems can invoke workflows through authenticated webhook endpoints.

### Action Execution

Actions represent atomic operations in a workflow. The system provides built-in actions for common tasks while allowing custom actions through the plugin system.

Workflows support conditional branching, loops, and error handling. The execution engine maintains audit logs and provides debugging tools for troubleshooting failed workflows.

## Security and Privacy Architecture

The platform implements defense-in-depth security while maintaining usability for a local-first application.

### Authentication and Authorization

User authentication uses JWT tokens with configurable expiration. The system supports local accounts (username/password) and integration with Manus OAuth for cloud-sync features.

Authorization checks occur at the tRPC procedure level, ensuring all API calls validate permissions before execution. The database schema enforces workspace isolation through foreign key constraints.

### Data Encryption

Sensitive data (API keys, credentials) encrypts at rest using AES-256. The encryption key derives from the user's password using PBKDF2 with high iteration counts.

File uploads can optionally encrypt before storage, with decryption occurring transparently during retrieval.

### Sandboxing

Plugins and custom tools execute in restricted sandboxes with no access to the host filesystem outside designated directories. Network access requires explicit permission and goes through a proxy that logs all requests.

## Performance Optimization Strategies

The platform implements several optimization techniques to ensure responsive operation even on modest hardware.

### Lazy Loading and Code Splitting

The frontend uses React lazy loading and route-based code splitting to minimize initial bundle size. Components load on-demand, reducing time-to-interactive.

### Database Query Optimization

All database queries use proper indices and avoid N+1 patterns. The system implements connection pooling and prepared statements for optimal performance.

### Caching Strategy

The platform employs multi-level caching: in-memory caching for frequently accessed data, Redis for distributed caching (optional), and browser caching for static assets.

Embeddings cache aggressively since they rarely change, while conversation history uses shorter TTLs to reflect recent updates.

### Background Processing

Long-running operations (model downloads, document ingestion, model conversion) execute in background workers. The system uses a job queue with priority scheduling and automatic retry on failure.

## Deployment and Distribution

The platform supports multiple deployment models to accommodate different user preferences and requirements.

### Desktop Application

Electron-based desktop application bundles the entire stack (frontend, backend, database, inference engine) into a single executable. Users install with a standard installer (MSI for Windows, DMG for macOS, AppImage for Linux).

The desktop app includes automatic updates, system tray integration, and OS-level notifications.

### Docker Deployment

Docker Compose configuration provides one-command deployment for users comfortable with containers. The setup includes all services with appropriate volume mounts for data persistence.

### Manual Installation

Advanced users can install components separately, allowing custom configurations and integration with existing infrastructure. The documentation provides detailed setup instructions for each component.

## Technology Stack Summary

**Frontend**: React 19, Tailwind CSS 4, tRPC React Query, Wouter (routing), Monaco Editor, Framer Motion

**Backend**: Node.js 22, Express 4, tRPC 11, Drizzle ORM, SuperJSON

**Database**: PostgreSQL (structured data), Qdrant/Milvus (vectors), S3-compatible (files)

**Inference**: llama.cpp, vLLM, ONNX Runtime

**Build Tools**: Vite 7, esbuild, TypeScript 5.9, Vitest

## Future Architecture Considerations

As the platform evolves, several architectural enhancements are planned to improve scalability and capabilities.

**Distributed Inference**: Support for splitting large models across multiple machines or GPUs, enabling inference of models that exceed single-machine resources.

**Federated Learning**: Allow users to collaboratively train models while keeping data local, using secure aggregation protocols.

**Advanced Caching**: Implement semantic caching for LLM responses, reducing redundant inference for similar queries.

**Real-Time Collaboration**: WebSocket-based collaboration enabling multiple users to work in the same workspace simultaneously with operational transformation for conflict resolution.

These enhancements will build on the solid foundation established in the initial release, maintaining backward compatibility while expanding capabilities.
