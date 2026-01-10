# Render MCP Quick Reference

## 🎯 Common Prompts

### Service Management
```
List all my Render services

Show details for my [service-name]

Create a web service called [name] with [repo-url]

Delete the service [service-name]
```

### Deployments
```
What's the deployment status of [service-name]?

Trigger a deployment for [service-name]

Show me deployment history for [service-name]

What's the latest deployment for [service-name]?
```

### Logs & Debugging
```
Show me the last 50 lines of logs from [service-name]

Get error logs from [service-name]

Tail the logs for [service-name] in real-time

Show logs from the last hour for [service-name]
```

### Environment Variables
```
List environment variables for [service-name]

Set DATABASE_URL to [value] on [service-name]

Update API_KEY on [service-name]

Remove the variable [VAR_NAME] from [service-name]
```

### Health & Metrics
```
Check the health of all my services

Show uptime for [service-name]

What's the CPU and memory usage of [service-name]?

Are there any failing services?
```

### Configuration Updates
```
Scale [service-name] to 2 instances

Change [service-name] to the Pro plan

Update the build command for [service-name]

Change the Docker image for [service-name]
```

## 🔧 Direct MCP Commands

If you need to use the MCP server directly:

```bash
# List all tools
curl -X POST https://mcp.render.com/mcp \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# List services
curl -X POST https://mcp.render.com/mcp \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"listServices"},"id":1}'

# Get service details
curl -X POST https://mcp.render.com/mcp \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"getService","arguments":{"serviceId":"srv-xxxxx"}},"id":1}'
```

## ⚡ Tips

1. **Be specific**: Use exact service names for faster results
2. **Use filters**: Add time ranges or log levels when querying logs
3. **Batch operations**: Ask for multiple services at once
4. **Natural language**: Claude understands context - just ask naturally!

## 🆘 Quick Troubleshooting

| Issue | Quick Fix |
|-------|-----------|
| "Authentication failed" | Check `RENDER_API_KEY` in `.env` |
| "Service not found" | Verify exact service name with `List all services` |
| "Connection timeout" | Check internet connection |
| Tools not working | Run `./.claude/setup-render-mcp.sh` |

## 📋 Cheat Sheet

```bash
# Setup
./.claude/setup-render-mcp.sh

# Test connection
curl -X POST https://mcp.render.com/mcp \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# View config
cat .claude/mcp_servers.json

# Update API key
echo "RENDER_API_KEY=rnd_new_key" > .env

# Check logs
tail -f logs/[service-name].log
```

## 🎓 Learning Path

1. **Start simple**: `List all my Render services`
2. **Explore one**: `Show details for [service]`
3. **Check logs**: `Get recent logs from [service]`
4. **Make changes**: `Set ENV_VAR to value on [service]`
5. **Deploy**: `Trigger deployment for [service]`

---

**Pro Tip**: Save your most common prompts as aliases or scripts for even faster access!
