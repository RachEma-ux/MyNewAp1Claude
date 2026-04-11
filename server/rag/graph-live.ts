/**
 * Graph Live Service — Server-Sent Events for real-time graph updates.
 */

import type { Express, Request, Response } from "express";

// Active SSE connections
const _clients = new Set<Response>();

export function registerLiveRoutes(app: Express) {

  // SSE stream endpoint
  app.get("/api/kgra-proxy/graph/stream", (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
    _clients.add(res);

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
    }, 30000);

    req.on('close', () => {
      _clients.delete(res);
      clearInterval(heartbeat);
    });
  });

  // Graph performance/health endpoint
  app.get("/api/kgra-proxy/graph/performance", async (_req, res) => {
    try {
      const { getRagDb } = await import("./connection");
      const ragDb = getRagDb();
      if (!ragDb) return res.json({ status: 'unavailable' });

      const { sql } = await import("drizzle-orm");
      const entityCount = ((await ragDb.execute(sql`SELECT COUNT(*) as cnt FROM kgra_entities`)) as any).rows?.[0]?.cnt || 0;
      const relCount = ((await ragDb.execute(sql`SELECT COUNT(*) as cnt FROM kgra_relationships`)) as any).rows?.[0]?.cnt || 0;
      const manualNodeCount = ((await ragDb.execute(sql`SELECT COUNT(*) as cnt FROM kgra_manual_nodes WHERE status='active'`)) as any).rows?.[0]?.cnt || 0;
      const manualEdgeCount = ((await ragDb.execute(sql`SELECT COUNT(*) as cnt FROM kgra_manual_edges WHERE status='active'`)) as any).rows?.[0]?.cnt || 0;
      const templateCount = ((await ragDb.execute(sql`SELECT COUNT(*) as cnt FROM kgra_templates WHERE status='active'`)) as any).rows?.[0]?.cnt || 0;
      const modeCount = ((await ragDb.execute(sql`SELECT COUNT(*) as cnt FROM kgra_modes`)) as any).rows?.[0]?.cnt || 0;

      res.json({
        status: 'healthy',
        entities: Number(entityCount),
        relationships: Number(relCount),
        manualNodes: Number(manualNodeCount),
        manualEdges: Number(manualEdgeCount),
        templates: Number(templateCount),
        modes: Number(modeCount),
        liveClients: _clients.size,
        timestamp: new Date().toISOString(),
      });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
}

// Broadcast an event to all connected SSE clients
export function broadcastGraphEvent(event: { type: string; payload: unknown }) {
  const data = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
  for (const client of _clients) {
    try { client.write(`data: ${data}\n\n`); } catch { _clients.delete(client); }
  }
}
