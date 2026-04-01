import type { Request, Response } from 'express';
import { sdk } from '../_core/sdk';
import { executeAgent } from './executor';
import { AppBlockerError, createGenericTechnicalBlocker } from '../_core/blockers';
import { invokeCatalogEntry } from '../ai-types/invoke';

function getDevOrAuthenticatedUser(req: Request) {
  if (process.env.DEV_MODE === "true") {
    return {
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
  }

  return sdk.authenticateRequest(req);
}

function setupSse(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  return (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}

`);
  };
}

function toStreamBlocker(error: unknown) {
  if (error instanceof AppBlockerError) {
    return error.blocker;
  }

  const technicalDetails = error instanceof Error ? error.message : String(error);
  return createGenericTechnicalBlocker(undefined, technicalDetails);
}

export async function handleAgentChatStream(req: Request, res: Response) {
  try {
    const user = await getDevOrAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { agentId } = req.params;
    const { conversationId, message } = req.query;

    if (!agentId || !conversationId || !message) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

    const sendEvent = setupSse(res);

    try {
      const result = await executeAgent({
        conversationId: parseInt(conversationId as string),
        userMessage: message as string,
        userId: user.id,
        workspaceId: 1,
      });

      sendEvent({ type: 'token', content: result.response });
      sendEvent({ type: 'done' });
    } catch (error: any) {
      console.error('[AgentChatStream] Error:', error);
      const blocker = toStreamBlocker(error);
      sendEvent({ type: 'error', error: blocker.summary, blocker });
    }

    res.end();
  } catch (error: any) {
    console.error('[AgentChatStream] Request error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

/**
 * Catalog agent chat stream — now uses the universal invoke path.
 * Runtime kind is resolved automatically (llm-chat or service).
 */
export async function handleCatalogAgentChatStream(req: Request, res: Response) {
  try {
    const user = await getDevOrAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { catalogEntryId } = req.params;
    const { conversationId, message } = req.query;

    if (!catalogEntryId || !message) {
      res.status(400).json({ error: 'Missing required parameters: catalogEntryId and message are required' });
      return;
    }

    const sendEvent = setupSse(res);

    try {
      for await (const event of invokeCatalogEntry({
        catalogEntryId: parseInt(catalogEntryId),
        actorUserId: user.id,
        message: message as string,
        conversationId: conversationId ? parseInt(conversationId as string) : undefined,
        triggerSource: "catalog_agent_chat",
      })) {
        // Map the universal event format to the legacy stream format
        if (event.type === "token") {
          sendEvent({ type: 'token', content: event.content });
        } else if (event.type === "complete") {
          sendEvent({ type: 'done' });
        } else if (event.type === "error") {
          sendEvent({ type: 'error', error: event.error });
        }
        // run_started events are informational — not sent in legacy format
      }
    } catch (error: any) {
      console.error('[CatalogAgentChatStream] Error:', error);
      const blocker = toStreamBlocker(error);
      sendEvent({ type: 'error', error: blocker.summary, blocker });
    }

    res.end();
  } catch (error: any) {
    console.error('[CatalogAgentChatStream] Request error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
