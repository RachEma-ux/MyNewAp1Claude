/**
 * Code Studio — IDE Proxy Middleware
 *
 * Provides a stable internal route for OpenCode Web instances.
 * Route: /api/code-studio/ide/:proxyKey/*
 *
 * Resolves the proxy key to an internal OpenCode Web port
 * and forwards all HTTP traffic. Raw ports are never exposed to users.
 */

import { type Request, type Response, type NextFunction, Router } from "express";
import * as http from "http";
import * as repo from "../repository";

const ideProxyRouter = Router();

/**
 * Proxy all requests to /api/code-studio/ide/:proxyKey/* to the
 * corresponding OpenCode Web instance on localhost.
 */
ideProxyRouter.all("/:proxyKey/*", async (req: Request, res: Response, _next: NextFunction) => {
  const { proxyKey } = req.params;

  try {
    const instance = await repo.getIdeInstanceByProxyKey(proxyKey);
    if (!instance || instance.status !== "running") {
      res.status(502).json({
        error: "IDE instance not available",
        message: instance ? `Instance status: ${instance.status}` : "No instance found for this key",
      });
      return;
    }

    // Update last accessed time (non-blocking)
    repo.updateIdeInstance(instance.id, { lastAccessedAt: new Date() }).catch(() => {});

    // Build target URL — strip the /api/code-studio/ide/:proxyKey prefix
    const prefix = `/api/code-studio/ide/${proxyKey}`;
    const targetPath = req.originalUrl.slice(prefix.length) || "/";
    const targetUrl = `http://${instance.hostname}:${instance.port}${targetPath}`;

    // Build proxy headers
    const proxyHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (key === "host" || key === "connection") continue;
      if (typeof value === "string") proxyHeaders[key] = value;
    }
    proxyHeaders.host = `${instance.hostname}:${instance.port}`;

    // Add auth if configured
    const password = process.env.OPENCODE_WEB_PASSWORD || process.env.OPENCODE_SERVER_PASSWORD || "";
    if (password) {
      const username = process.env.OPENCODE_SERVER_USERNAME || "opencode";
      proxyHeaders.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    }

    // Proxy the request
    const parsed = new URL(targetUrl);
    const baseHref = `${prefix}/`;
    const proxyReq = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: req.method,
        headers: proxyHeaders,
      },
      (proxyRes) => {
        // Forward status and headers
        const responseHeaders: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value) responseHeaders[key] = value;
        }
        // Remove auth-related headers from upstream
        delete responseHeaders["www-authenticate"];

        const contentType = proxyRes.headers["content-type"] || "";
        const isHtml = contentType.includes("text/html");

        if (isHtml && targetPath === "/") {
          // Inject <base href> so the browser resolves absolute asset
          // paths (e.g. /assets/index.js) through the proxy prefix.
          const chunks: Buffer[] = [];
          proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
          proxyRes.on("end", () => {
            let body = Buffer.concat(chunks).toString("utf-8");
            body = body.replace("<head>", `<head><base href="${baseHref}">`);
            delete responseHeaders["content-length"];
            delete responseHeaders["content-encoding"];
            res.writeHead(proxyRes.statusCode || 200, responseHeaders);
            res.end(body);
          });
          return;
        }

        res.writeHead(proxyRes.statusCode || 502, responseHeaders);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on("error", (err) => {
      if (!res.headersSent) {
        res.status(502).json({
          error: "IDE proxy error",
          message: `Failed to reach OpenCode Web: ${err.message}`,
        });
      }
    });

    // Pipe request body
    req.pipe(proxyReq, { end: true });
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({
        error: "IDE proxy internal error",
        message: err.message,
      });
    }
  }
});

/**
 * Handle the root of a proxy key (no trailing path).
 */
ideProxyRouter.all("/:proxyKey", (req: Request, res: Response) => {
  // Redirect to trailing slash for correct relative URL resolution
  res.redirect(301, `${req.originalUrl}/`);
});

export { ideProxyRouter };
