import type { Request, Response } from 'express';
import { sdk } from '../_core/sdk';
import { getAgent } from './db';
import { executeAgent } from './executor';

export async function handleAgentChatStream(req: Request, res: Response) {
  try {
    let user;
    if (process.env.DEV_MODE === "true" && process.env.NODE_ENV !== "production") {
      user = {
        id: 1,
        openId: "dev-user-001",
        name: "Dev User",
        email: "dev@example.com",
        loginMethod: "dev-mode",
        role: "user" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };
    } else {
      user = await sdk.authenticateRequest(req);
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    const { agentId } = req.params;
    const { conversationId, message } = req.query;

    if (!agentId || !conversationId || !message) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

    // Get agent
    const agent = await getAgent(parseInt(agentId));
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Execute agent
      const result = await executeAgent({
        conversationId: parseInt(conversationId as string),
        userMessage: message as string,
        userId: user.id,
        workspaceId: agent.workspaceId,
      });
      
      // Send response
      sendEvent({ type: 'token', content: result.response });
      sendEvent({ type: 'done' });
    } catch (error: any) {
      console.error('[AgentChatStream] Error:', error);
      sendEvent({ type: 'error', error: error.message });
    }

    res.end();
  } catch (error: any) {
    console.error('[AgentChatStream] Request error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
