# Troubleshooting Guide

## Common Issues and Solutions

### Authentication Issues

#### Cannot Login

**Symptoms:**
- Redirect loop
- "Unauthorized" error
- Session expires immediately

**Solutions:**
1. Clear browser cookies and cache
2. Check if OAuth server is accessible
3. Verify JWT_SECRET is set correctly
4. Check browser console for errors

#### Session Expires Too Quickly

**Solutions:**
1. Increase JWT token expiration in settings
2. Check system clock synchronization
3. Verify secure cookie settings

---

### Provider Issues

#### API Key Invalid

**Symptoms:**
- "Invalid API key" error
- 401 Unauthorized responses

**Solutions:**
1. Verify API key is correct (no extra spaces)
2. Check key hasn't expired
3. Verify key has correct permissions
4. Test connection in Settings

#### Rate Limit Exceeded

**Symptoms:**
- 429 Too Many Requests
- "Rate limit exceeded" error

**Solutions:**
1. Wait for rate limit to reset
2. Upgrade provider plan
3. Implement request queuing
4. Use multiple providers

#### Provider Timeout

**Symptoms:**
- Request hangs
- Timeout error after 30s

**Solutions:**
1. Check internet connection
2. Verify provider API status
3. Reduce maxTokens parameter
4. Enable fallback provider

---

### Chat Issues

#### Messages Not Sending

**Symptoms:**
- Spinner keeps spinning
- No response received

**Solutions:**
1. Check provider configuration
2. Verify API key is valid
3. Check browser console for errors
4. Test with different provider

#### Streaming Not Working

**Symptoms:**
- Full response appears at once
- No streaming chunks

**Solutions:**
1. Check if provider supports streaming
2. Verify /api/chat/stream endpoint
3. Check browser EventSource support
4. Disable browser extensions

#### RAG Not Working

**Symptoms:**
- Responses don't use document context
- "No context found" message

**Solutions:**
1. Verify documents are uploaded and processed
2. Check collection name matches
3. Verify workspace ID is correct
4. Check Qdrant is running
5. View document processing logs

---

### Document Issues

#### Upload Failing

**Symptoms:**
- Upload stuck at 0%
- "Upload failed" error

**Solutions:**
1. Check file size (< 50MB)
2. Verify file format is supported
3. Check storage quota
4. Check S3 credentials
5. Try smaller file first

#### Processing Stuck

**Symptoms:**
- Status stays "processing"
- No progress for > 5 minutes

**Solutions:**
1. Check extraction service logs
2. Verify file is not corrupted
3. Check Qdrant connection
4. Restart processing job
5. Check embedding service

#### Search Returns No Results

**Symptoms:**
- Empty search results
- "No documents found"

**Solutions:**
1. Verify documents are fully processed
2. Check collection name
3. Try broader search terms
4. Check vector embeddings exist
5. Verify Qdrant collection exists

---

### Agent Issues

#### Agent Not Responding

**Symptoms:**
- No response from agent
- Timeout error

**Solutions:**
1. Check agent configuration
2. Verify provider is configured
3. Check tool permissions
4. View agent execution logs
5. Test with simpler prompt

#### Tools Not Working

**Symptoms:**
- Tool calls fail
- "Tool not found" error

**Solutions:**
1. Verify tools are enabled
2. Check tool permissions
3. Verify API keys for external tools
4. Check tool implementation
5. View tool execution logs

#### Agent Memory Issues

**Symptoms:**
- Agent forgets context
- Inconsistent responses

**Solutions:**
1. Check conversation history
2. Verify memory storage
3. Increase context window
4. Check token limits
5. Clear and restart conversation

---

### Automation Issues

#### Workflow Not Executing

**Symptoms:**
- Scheduled workflow doesn't run
- Manual execution fails

**Solutions:**
1. Check workflow is enabled
2. Verify trigger configuration
3. Check cron expression syntax
4. View execution logs
5. Test individual actions

#### Trigger Not Firing

**Symptoms:**
- Time-based trigger misses schedule
- Event trigger doesn't activate

**Solutions:**
1. Verify cron expression
2. Check system timezone
3. Verify event listeners are active
4. Check webhook endpoint
5. View trigger logs

#### Action Failing

**Symptoms:**
- Workflow starts but fails mid-execution
- Specific action errors

**Solutions:**
1. Check action configuration
2. Verify required credentials
3. Check action dependencies
4. View detailed error logs
5. Test action independently

---

### Model Issues

#### Download Failing

**Symptoms:**
- Download stops mid-way
- "Download failed" error

**Solutions:**
1. Check internet connection
2. Verify disk space
3. Check HuggingFace API access
4. Resume download if supported
5. Try different mirror

#### Conversion Failing

**Symptoms:**
- GGUF conversion errors
- Quantization fails

**Solutions:**
1. Check source model format
2. Verify disk space
3. Check llama.cpp installation
4. Try different quantization level
5. View conversion logs

#### Local Inference Not Working

**Symptoms:**
- Model loads but doesn't respond
- OOM (Out of Memory) errors

**Solutions:**
1. Check hardware requirements
2. Reduce model size/quantization
3. Close other applications
4. Increase swap space
5. Use smaller context window

---

### Hardware Issues

#### GPU Not Detected

**Symptoms:**
- "No GPU found"
- Falls back to CPU

**Solutions:**
1. Check GPU drivers installed
2. Verify CUDA/ROCm installation
3. Check GPU is not in use
4. Restart system
5. Check hardware compatibility

#### High Memory Usage

**Symptoms:**
- System slow
- OOM errors

**Solutions:**
1. Reduce concurrent requests
2. Clear model cache
3. Use smaller models
4. Increase system RAM
5. Enable swap space

#### Performance Issues

**Symptoms:**
- Slow responses
- High latency

**Solutions:**
1. Check hardware utilization
2. Reduce model size
3. Enable GPU acceleration
4. Optimize chunk size
5. Use batch processing

---

### Database Issues

#### Connection Failed

**Symptoms:**
- "Database connection failed"
- Timeout errors

**Solutions:**
1. Check DATABASE_URL is correct
2. Verify database is running
3. Check network connectivity
4. Verify credentials
5. Check firewall rules

#### Migration Errors

**Symptoms:**
- "Migration failed"
- Schema mismatch

**Solutions:**
1. Run `pnpm db:push`
2. Check migration files
3. Verify database permissions
4. Backup and recreate database
5. Check Drizzle configuration

#### Slow Queries

**Symptoms:**
- Database operations timeout
- High latency

**Solutions:**
1. Add database indexes
2. Optimize query patterns
3. Increase connection pool
4. Check database size
5. Analyze slow query logs

---

### Collaboration Issues

#### Real-Time Sync Not Working

**Symptoms:**
- Changes don't sync
- Cursor positions not showing

**Solutions:**
1. Check WebSocket connection
2. Verify collaboration service running
3. Check firewall/proxy settings
4. Refresh browser
5. Check browser console

#### Connection Drops

**Symptoms:**
- Frequent disconnections
- "Connection lost" message

**Solutions:**
1. Check internet stability
2. Verify WebSocket port open
3. Check proxy settings
4. Increase timeout
5. Use wired connection

---

### Voice Issues

#### Microphone Not Working

**Symptoms:**
- "No microphone found"
- Permission denied

**Solutions:**
1. Grant microphone permission
2. Check browser settings
3. Verify microphone connected
4. Try different browser
5. Check system audio settings

#### Speech Recognition Fails

**Symptoms:**
- "No speech detected"
- Poor transcription accuracy

**Solutions:**
1. Speak clearly and slowly
2. Reduce background noise
3. Check microphone quality
4. Try different language
5. Use push-to-talk

#### Text-to-Speech Not Working

**Symptoms:**
- No audio output
- "Speech synthesis failed"

**Solutions:**
1. Check browser audio permissions
2. Verify speakers/headphones
3. Check system volume
4. Try different browser
5. Check browser compatibility

---

### Performance Optimization

#### Slow Page Load

**Solutions:**
1. Clear browser cache
2. Disable unnecessary extensions
3. Check network speed
4. Optimize bundle size
5. Enable compression

#### High CPU Usage

**Solutions:**
1. Close unused tabs
2. Disable animations
3. Reduce polling frequency
4. Use lighter theme
5. Limit concurrent operations

#### Memory Leaks

**Solutions:**
1. Refresh page regularly
2. Close old conversations
3. Clear cache
4. Update browser
5. Report to developers

---

## Debugging Tools

### Browser Console

Press F12 to open developer tools and check:
- Console for errors
- Network tab for failed requests
- Application tab for storage

### Server Logs

Check server logs for detailed errors:
```bash
cd /home/ubuntu/mynewappv1
pnpm dev
```

### Database Inspection

Access database directly:
```bash
# View tables
pnpm drizzle-kit studio

# Run SQL
pnpm db:query "SELECT * FROM users LIMIT 10"
```

### API Testing

Test API endpoints with curl:
```bash
curl -X POST https://api.example.com/trpc/chat.sendMessage \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"providerId": 1, "messages": [...]}'
```

---

## Getting Help

If you can't resolve the issue:

1. **Check Documentation**: https://docs.unified-llm.ai
2. **Search GitHub Issues**: https://github.com/unified-llm/platform/issues
3. **Ask on Discord**: https://discord.gg/unified-llm
4. **Contact Support**: support@unified-llm.ai

When reporting issues, include:
- Error message
- Steps to reproduce
- Browser/OS version
- Screenshots
- Console logs
