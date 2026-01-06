# System Dependencies Setup

This document guides you through installing the required system dependencies for local AI inference.

## Prerequisites

- **Operating System**: Linux (Ubuntu 22.04+), macOS (12+), or Windows (10/11 with WSL2)
- **RAM**: Minimum 16GB (32GB+ recommended for larger models)
- **Storage**: 50GB+ free space for models
- **GPU** (Optional): NVIDIA GPU with CUDA 11.8+ for accelerated inference

---

## 1. Qdrant Vector Database

Qdrant is used for storing and searching vector embeddings.

### Option A: Docker (Recommended)

```bash
# Pull and run Qdrant
docker run -p 6333:6333 -p 6334:6334 \
    -v $(pwd)/qdrant_storage:/qdrant/storage:z \
    qdrant/qdrant
```

### Option B: Binary Installation

**Linux/macOS:**
```bash
# Download latest release
curl -L https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-unknown-linux-gnu.tar.gz | tar xz

# Run Qdrant
./qdrant
```

**Windows:**
Download from [Qdrant Releases](https://github.com/qdrant/qdrant/releases)

### Verify Installation

```bash
curl http://localhost:6333/
# Should return: {"title":"qdrant - vector search engine","version":"..."}
```

---

## 2. Ollama (Local LLM Runtime)

Ollama provides easy local model management and inference.

### Installation

**macOS:**
```bash
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:**
Download from [ollama.com](https://ollama.com)

### Start Ollama Service

```bash
ollama serve
```

### Pull Models

```bash
# Recommended models
ollama pull llama2:7b          # General purpose (3.8GB)
ollama pull mistral:7b         # Fast and capable (4.1GB)
ollama pull codellama:7b       # Code generation (3.8GB)
ollama pull nomic-embed-text   # Embeddings (274MB)
```

### Verify Installation

```bash
curl http://localhost:11434/api/tags
# Should return list of installed models
```

---

## 3. llama.cpp (Advanced Local Inference)

llama.cpp provides high-performance inference with GPU acceleration.

### Build from Source

**Prerequisites:**
```bash
# Ubuntu/Debian
sudo apt-get install build-essential cmake

# macOS
brew install cmake
```

**Clone and Build:**
```bash
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp

# CPU only
make

# With CUDA (NVIDIA GPU)
make LLAMA_CUBLAS=1

# With Metal (Apple Silicon)
make LLAMA_METAL=1
```

### Download GGUF Models

```bash
# Create models directory
mkdir -p models

# Download model (example: Llama 2 7B)
wget https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF/resolve/main/llama-2-7b-chat.Q4_K_M.gguf \
    -O models/llama-2-7b-chat.Q4_K_M.gguf
```

### Test Inference

```bash
./main -m models/llama-2-7b-chat.Q4_K_M.gguf -p "Hello, how are you?" -n 128
```

---

## 4. Environment Configuration

Update your `.env` file with the service URLs:

```env
# Qdrant
QDRANT_URL=http://localhost:6333

# Ollama
OLLAMA_URL=http://localhost:11434

# llama.cpp (if running as server)
LLAMACPP_URL=http://localhost:8080
```

---

## 5. Verification Checklist

After installation, verify all services are running:

```bash
# Qdrant
curl http://localhost:6333/ && echo "✓ Qdrant OK"

# Ollama
curl http://localhost:11434/api/tags && echo "✓ Ollama OK"

# llama.cpp (if running server mode)
curl http://localhost:8080/health && echo "✓ llama.cpp OK"
```

---

## 6. Model Recommendations by Use Case

### General Chat (7B models, ~4GB)
- **Llama 2 7B Chat**: Balanced performance
- **Mistral 7B Instruct**: Fast and capable
- **Zephyr 7B Beta**: Helpful assistant

### Code Generation (7B models, ~4GB)
- **Code Llama 7B**: Code completion
- **WizardCoder 7B**: Code understanding
- **StarCoder**: Multi-language support

### Embeddings (~300MB)
- **nomic-embed-text**: General purpose (Ollama)
- **BGE Large EN**: High quality (manual)
- **E5 Large**: Multilingual

### Large Models (13B+, 8GB+)
- **Llama 2 13B**: Better reasoning
- **Mixtral 8x7B**: Mixture of experts (requires 32GB+ RAM)

---

## 7. GPU Acceleration

### NVIDIA CUDA Setup

```bash
# Install CUDA Toolkit 11.8+
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.0-1_all.deb
sudo dpkg -i cuda-keyring_1.0-1_all.deb
sudo apt-get update
sudo apt-get install cuda

# Verify
nvidia-smi
```

### Apple Silicon (Metal)

Metal acceleration is automatically enabled on Apple Silicon Macs when building llama.cpp with `LLAMA_METAL=1`.

---

## 8. Troubleshooting

### Qdrant not starting
- Check port 6333 is not in use: `lsof -i :6333`
- Check logs: `docker logs <container-id>`

### Ollama connection refused
- Ensure service is running: `ollama serve`
- Check firewall settings

### llama.cpp out of memory
- Use smaller quantization (Q4_K_M instead of Q8_0)
- Reduce context size with `-c` flag
- Close other applications

### Slow inference
- Enable GPU acceleration (CUDA/Metal)
- Use quantized models (Q4 or Q5)
- Reduce batch size

---

## 9. Production Deployment

For production environments:

1. **Use Docker Compose** to orchestrate all services
2. **Set up monitoring** with Prometheus/Grafana
3. **Configure reverse proxy** (nginx) for API access
4. **Enable authentication** for Qdrant and Ollama
5. **Set resource limits** to prevent OOM
6. **Use persistent volumes** for model storage

Example `docker-compose.yml`:

```yaml
version: '3.8'

services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - ./qdrant_storage:/qdrant/storage
    restart: unless-stopped

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ./ollama_models:/root/.ollama
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

---

## 10. Next Steps

After completing setup:

1. Visit `/setup/ollama` in the app to verify Ollama connection
2. Go to `/embeddings` to test embedding generation
3. Visit `/vectordb` to create collections
4. Try `/inference` for local model inference
5. Upload documents at `/documents/upload` to enable RAG

For detailed usage guides, see the [User Documentation](./docs/USER_GUIDE.md).
