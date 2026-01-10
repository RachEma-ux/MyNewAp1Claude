# Render MCP Server Configuration

This directory contains the configuration for the **Render MCP Server**, which allows Claude Code to interact with your Render.com infrastructure.

## 🚀 Quick Start

### 1. Run the Setup Script

```bash
./.claude/setup-render-mcp.sh
```

This will:
- Create `.env` file if it doesn't exist
- Prompt you to add your Render API key
- Test the connection to Render MCP server
- List available tools

### 2. Get Your Render API Key

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Navigate to **Account Settings** → **API Keys**
3. Click **Create API Key**
4. Copy the key
5. Paste it into `.env`:

```bash
RENDER_API_KEY=your_actual_api_key_here
```

### 3. Test It Works

Once configured, try these prompts in Claude Code:

```
"List all my Render services"

"What's the deployment status of my web-app?"

"Show me the last 50 lines of logs from my api service"

"What environment variables are set for my production service?"
```

## 📁 Files in This Directory

- **`mcp.json`** - Main MCP server configuration (node-based)
- **`mcp_servers.json`** - HTTP-based MCP configuration
- **`setup-render-mcp.sh`** - Automated setup and testing script
- **`README.md`** - This file

## 🛠️ Available Render MCP Tools

The Render MCP server provides these capabilities:

| Tool | Description |
|------|-------------|
| `listServices` | List all your Render services |
| `getService` | Get details about a specific service |
| `createService` | Create a new Render service |
| `updateService` | Update service configuration |
| `deleteService` | Delete a service |
| `getLogs` | Fetch service logs (supports tail, limit) |
| `getDeployments` | List deployments for a service |
| `triggerDeploy` | Trigger a manual deployment |
| `getEnvVars` | List environment variables |
| `updateEnvVars` | Set or update environment variables |
| `getMetrics` | Get service metrics and health |

## 🔧 Manual Configuration

If the automated setup doesn't work, you can manually configure:

### For Claude Code CLI

Create or edit `~/.config/claude/mcp_servers.json`:

```json
{
  "mcpServers": {
    "render": {
      "url": "https://mcp.render.com/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer YOUR_RENDER_API_KEY",
        "Content-Type": "application/json"
      }
    }
  }
}
```

### For Claude Desktop

Edit Claude Desktop config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Add:
```json
{
  "mcpServers": {
    "render": {
      "url": "https://mcp.render.com/mcp",
      "apiKey": "YOUR_RENDER_API_KEY"
    }
  }
}
```

## 🔐 Security Best Practices

1. **Never commit `.env`** - Already in `.gitignore`
2. **Use read-only API keys** when possible
3. **Rotate keys regularly** (every 90 days recommended)
4. **Use different keys** for different environments
5. **Revoke unused keys** immediately

## 🧪 Testing the Connection

### Quick Test

```bash
curl -X POST https://mcp.render.com/mcp \
  -H "Authorization: Bearer YOUR_RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {"name": "listServices", "description": "..."},
      ...
    ]
  },
  "id": 1
}
```

### Full Setup Test

```bash
./.claude/setup-render-mcp.sh
```

## 🐛 Troubleshooting

### "Authentication failed" Error

**Problem**: API key is invalid or expired

**Solution**:
1. Generate a new API key at [Render Dashboard](https://dashboard.render.com/account/settings#api-keys)
2. Update `.env` with the new key
3. Run setup script again

### "Could not connect" Error

**Problem**: Network connectivity issues

**Solution**:
1. Check internet connection
2. Verify MCP server URL: `https://mcp.render.com/mcp`
3. Check if Render is having issues: [status.render.com](https://status.render.com)

### Tools Not Available in Claude Code

**Problem**: MCP configuration not loaded

**Solution**:
1. Restart Claude Code
2. Check configuration file syntax (must be valid JSON)
3. Verify environment variables are loaded
4. Check logs for errors

### Permission Denied Errors

**Problem**: API key doesn't have required permissions

**Solution**:
1. Create a new API key with full permissions
2. Or use a different key for different operations

## 📚 Example Use Cases

### 1. Deploy a New Service

**Prompt:**
```
Create a new web service on Render called 'api-backend' using the free plan,
with the Git repo https://github.com/myuser/api-backend and environment
variable DATABASE_URL set to [url]
```

### 2. Monitor Service Health

**Prompt:**
```
Check the health and uptime of all my Render services
```

### 3. Debug with Logs

**Prompt:**
```
Show me the last 100 lines of logs from my production-api service,
and highlight any errors
```

### 4. Update Environment Variables

**Prompt:**
```
Set API_KEY to 'sk-...' and ENVIRONMENT to 'production' on my web-app service
```

### 5. Trigger Deployment

**Prompt:**
```
Trigger a manual deployment for my staging service
```

## 🔄 Updating Configuration

To update the MCP configuration:

1. Edit the configuration file
2. Restart Claude Code or reload configuration
3. Test with a simple prompt

## 📝 Environment Variables

Required in `.env`:

```bash
# Render API Key (Required)
RENDER_API_KEY=rnd_xxxxxxxxxxxxx

# Optional: Override MCP server URL
# RENDER_MCP_URL=https://mcp.render.com/mcp

# Optional: Timeout in milliseconds
# RENDER_MCP_TIMEOUT=30000
```

## 🤝 Contributing

If you find issues or have suggestions for the MCP configuration:

1. Document the issue
2. Test with the setup script
3. Update configuration files as needed
4. Update this README

## 📖 Additional Resources

- [Render API Documentation](https://render.com/docs/api)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Claude Code Documentation](https://claude.ai/docs)
- [Render Status Page](https://status.render.com)

## ✨ What's Next?

After setup, Claude Code can:
- ✅ List and manage your Render services
- ✅ Monitor deployments and logs
- ✅ Update environment variables
- ✅ Trigger manual deployments
- ✅ Get service metrics and health status

Try asking Claude Code to help you with your Render infrastructure!

---

**Need help?** Run `./.claude/setup-render-mcp.sh` for interactive setup.
