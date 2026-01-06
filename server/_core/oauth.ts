import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
              .error-box { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px; text-align: center; }
              h1 { color: #dc2626; margin-top: 0; }
              p { color: #666; line-height: 1.6; }
              a { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; }
              a:hover { background: #1d4ed8; }
            </style>
          </head>
          <body>
            <div class="error-box">
              <h1>Authentication Error</h1>
              <p>The authentication request is missing required parameters. Please try logging in again.</p>
              <a href="/">Return to Home</a>
            </div>
          </body>
        </html>
      `);
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Error</title>
              <style>
                body { font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
                .error-box { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px; text-align: center; }
                h1 { color: #dc2626; margin-top: 0; }
                p { color: #666; line-height: 1.6; }
                a { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; }
                a:hover { background: #1d4ed8; }
              </style>
            </head>
            <body>
              <div class="error-box">
                <h1>Authentication Error</h1>
                <p>User information is incomplete. Please contact support if this problem persists.</p>
                <a href="/">Return to Home</a>
              </div>
            </body>
          </html>
        `);
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      
      // Check if it's a database error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isDatabaseError = errorMessage.includes('TiDB') || errorMessage.includes('database') || errorMessage.includes('connection');
      
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
              .error-box { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px; text-align: center; }
              h1 { color: #dc2626; margin-top: 0; }
              p { color: #666; line-height: 1.6; }
              .error-type { background: #fef2f2; padding: 0.5rem 1rem; border-radius: 4px; margin: 1rem 0; font-weight: 600; color: #991b1b; }
              a { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; }
              a:hover { background: #1d4ed8; }
            </style>
          </head>
          <body>
            <div class="error-box">
              <h1>Authentication Failed</h1>
              ${isDatabaseError ? `
                <div class="error-type">⚠️ Database Connection Error</div>
                <p>The authentication system is temporarily unavailable due to database connectivity issues. Please try again in a few moments.</p>
              ` : `
                <div class="error-type">⚠️ Authentication Error</div>
                <p>We encountered an error while trying to sign you in. This could be due to:</p>
                <ul style="text-align: left; color: #666;">
                  <li>Network connectivity issues</li>
                  <li>Invalid or expired authentication token</li>
                  <li>Server configuration problems</li>
                </ul>
              `}
              <a href="/">Try Again</a>
            </div>
          </body>
        </html>
      `);
    }
  });
}
