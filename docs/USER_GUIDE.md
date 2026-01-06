# User Guide

## Getting Started

Welcome to Unified LLM! This guide will help you get started with the platform.

## Table of Contents

1. [Installation](#installation)
2. [First Steps](#first-steps)
3. [Workspaces](#workspaces)
4. [Providers](#providers)
5. [Chat](#chat)
6. [Documents & RAG](#documents--rag)
7. [Agents](#agents)
8. [Automation](#automation)
9. [Models](#models)
10. [Advanced Features](#advanced-features)

---

## Installation

### Web Version

Simply visit https://app.unified-llm.ai and sign in with your account.

### Desktop Version

Download the installer for your platform:
- Windows: `UnifiedLLM-Setup.exe`
- macOS: `UnifiedLLM.dmg`
- Linux: `UnifiedLLM.AppImage`

### Docker

```bash
docker pull unifiedllm/platform:latest
docker run -p 3000:3000 unifiedllm/platform
```

---

## First Steps

### 1. Create Your First Workspace

Workspaces help you organize your projects:

1. Click "New Workspace" in the sidebar
2. Enter a name and description
3. Click "Create"

### 2. Configure a Provider

Add your first LLM provider:

1. Go to Settings → API Keys
2. Select a provider (OpenAI, Anthropic, Google)
3. Enter your API key
4. Click "Test Connection"
5. Click "Save"

### 3. Start Chatting

1. Navigate to Chat
2. Select a provider
3. Type your message
4. Press Enter or click Send

---

## Workspaces

Workspaces are isolated environments for different projects.

### Creating a Workspace

```
Sidebar → New Workspace → Enter details → Create
```

### Switching Workspaces

Click the workspace dropdown in the top bar.

### Workspace Settings

Each workspace has:
- Name and description
- Member access control
- Resource quotas
- Document collections
- Agent instances

---

## Providers

### Supported Providers

- **OpenAI** - GPT-4, GPT-3.5
- **Anthropic** - Claude 3 family
- **Google** - Gemini models
- **Local** - Ollama, llama.cpp

### Adding a Provider

1. Settings → API Keys
2. Select provider
3. Enter API key
4. Configure settings
5. Test connection
6. Save

### Provider Settings

- **Temperature** - Creativity (0-2)
- **Max Tokens** - Response length
- **Top P** - Nucleus sampling
- **Frequency Penalty** - Repetition control

---

## Chat

### Basic Chat

1. Select a provider
2. Type your message
3. Get instant responses

### Streaming Responses

Responses stream in real-time for faster feedback.

### RAG (Retrieval-Augmented Generation)

Enable RAG to chat with your documents:

1. Upload documents first
2. Toggle "Use RAG" in chat
3. Select workspace
4. Ask questions about your documents

### Conversation History

- View past conversations in Conversations page
- Resume any conversation
- Search conversations
- Delete conversations

---

## Documents & RAG

### Uploading Documents

1. Go to Document Upload
2. Select workspace
3. Choose collection name
4. Upload file (PDF, DOCX, TXT, MD)
5. Wait for processing

### Document Processing

Documents are automatically:
1. **Extracted** - Text extracted from file
2. **Chunked** - Split into semantic chunks
3. **Embedded** - Converted to vectors
4. **Stored** - Saved in vector database

### Searching Documents

Use the Documents Dashboard to:
- View all documents
- Search by content
- Filter by status
- Preview chunks
- Delete documents

---

## Agents

### What are Agents?

Agents are specialized AI assistants with:
- Specific roles and expertise
- Access to tools
- Custom instructions
- Memory and context

### Creating an Agent

1. Go to Agent Templates
2. Browse templates
3. Click "Deploy Agent"
4. Configure settings
5. Start chatting

### Agent Templates

- **Research Assistant** - Helps with research
- **Code Helper** - Assists with coding
- **Writing Assistant** - Improves writing
- **Data Analyst** - Analyzes data
- **Customer Support** - Handles support

### Chatting with Agents

1. Go to Agent Dashboard
2. Select an agent
3. Start conversation
4. Agents can use tools and access documents

---

## Automation

### Creating Workflows

1. Go to Automation Builder
2. Click "New Workflow"
3. Configure trigger
4. Add actions
5. Save workflow

### Triggers

- **Time** - Cron schedule
- **Event** - Platform events
- **Webhook** - External triggers

### Actions

- Send email
- Run agent
- Process document
- Call API
- Execute code

### Testing Workflows

Click "Test" to run workflow immediately and view logs.

---

## Models

### Browsing Models

1. Go to Models page
2. Browse HuggingFace models
3. Filter by task, size, license

### Downloading Models

1. Select a model
2. Choose quantization (Q4, Q8, F16)
3. Click "Download"
4. Monitor progress

### GGUF Conversion

Convert models to GGUF format for local inference:

1. Select model
2. Choose quantization level
3. Start conversion
4. Wait for completion

### Local Inference

Run models locally:
- Requires compatible hardware
- See hardware recommendations
- Configure in Settings

---

## Advanced Features

### Code Editor

Use the built-in Monaco editor for:
- Writing scripts
- Editing configurations
- Creating plugins

### Real-Time Collaboration

Collaborate with team members:
1. Create collaboration session
2. Share session link
3. Edit together in real-time
4. See cursor positions

### Voice Input

Use voice commands:
1. Click microphone icon
2. Speak your message
3. Text appears automatically

### Text-to-Speech

Listen to responses:
1. Click speaker icon
2. Response is read aloud
3. Pause/resume as needed

### Layout Modes

Switch between layouts:
- **Chat Mode** - Focus on conversation
- **Code Mode** - Sidebar + editor
- **Dashboard Mode** - Full dashboard view

### Resource Monitoring

Monitor system resources:
- GPU/CPU usage
- VRAM/RAM usage
- Model cache status
- Request queue

### Hardware Recommendations

Get model recommendations based on your hardware:
1. Go to Resources page
2. View hardware profile
3. See recommended models
4. One-click download

---

## Keyboard Shortcuts

- `Ctrl/Cmd + Enter` - Send message
- `Ctrl/Cmd + K` - New conversation
- `Ctrl/Cmd + /` - Search
- `Ctrl/Cmd + ,` - Settings
- `Ctrl/Cmd + S` - Save (in editor)

---

## Troubleshooting

### Chat not working

1. Check provider API key
2. Test connection in Settings
3. Check rate limits
4. View error logs

### Document upload failing

1. Check file format (PDF, DOCX, TXT, MD)
2. Verify file size < 50MB
3. Check workspace storage quota
4. View processing logs

### Agent not responding

1. Check agent configuration
2. Verify tools are enabled
3. Check provider status
4. View agent logs

### Performance issues

1. Check hardware resources
2. Clear model cache
3. Reduce concurrent requests
4. Optimize document chunks

---

## Support

Need help?

- **Documentation**: https://docs.unified-llm.ai
- **Community**: https://discord.gg/unified-llm
- **GitHub**: https://github.com/unified-llm/platform
- **Email**: support@unified-llm.ai

---

## FAQ

**Q: Is my data private?**
A: Yes, all data is encrypted and stored securely. You control your data.

**Q: Can I use my own models?**
A: Yes, you can use local models via Ollama or llama.cpp.

**Q: What file formats are supported?**
A: PDF, DOCX, TXT, MD, HTML, and more.

**Q: How much does it cost?**
A: Free tier available. Pro plans start at $20/month.

**Q: Can I self-host?**
A: Yes, Docker images and source code available.

---

## Next Steps

- Join our Discord community
- Follow tutorials
- Explore agent templates
- Build custom workflows
- Share feedback

Happy building! 🚀
