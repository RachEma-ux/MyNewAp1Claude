/**
 * AI Agent Studio — MCP OAuth (generic OAuth 2.0 + PKCE)
 *
 * Phase 15b: Lets the user authenticate to an MCP server that requires
 * OAuth before connecting. Generic flow only — no provider-specific
 * adapters (Decision #6).
 *
 * Architecture (Decision #3, no platform-file edits):
 *
 *   1. UI clicks "Connect (OAuth)" on an MCP server row
 *   2. Frontend calls mcp.oauth.initiate(serverId)
 *   3. Server generates a code_verifier + code_challenge (PKCE) and
 *      stores them in agsDraftMcpServers.oauthState (encrypted)
 *   4. Server returns the authorization URL (with state, code_challenge,
 *      redirect_uri pointing at our static HTML callback)
 *   5. Frontend opens the URL in a new window
 *   6. User authorizes; provider redirects to our callback HTML
 *   7. The HTML page extracts ?code=... from the URL and POSTs it back
 *      to mcp.oauth.exchange(serverId, code)
 *   8. Server exchanges code for tokens, stores them encrypted in
 *      oauthState.tokens
 *   9. Subsequent mcp.connect calls inject the access token as a
 *      Bearer header
 *
 * Why static HTML for the callback (not a server endpoint):
 *   - Adding a /api/agent-studio/mcp/oauth/callback route would require
 *     editing server/_core/index.ts, which violates the standalone
 *     constraint (Decision #3)
 *   - The static HTML approach: we serve a tiny HTML page from the
 *     module's public assets that runs window.opener.postMessage with
 *     the code, and the parent window calls the exchange procedure.
 *     Zero platform edits.
 *
 * Encryption: tokens are stored via encryptString/decryptString from
 * server/_core/encryption.ts (the platform helper). Production gates
 * already require ENCRYPTION_KEY to be set.
 */

import { randomBytes, createHash } from "crypto";

// ── Public types ────────────────────────────────────────────────────────────

export interface OAuthConfig {
  /** OAuth provider authorization endpoint */
  authorizationUrl: string;
  /** OAuth provider token endpoint */
  tokenUrl: string;
  /** Client id from the provider */
  clientId: string;
  /** Optional client secret (omitted for public clients) */
  clientSecret?: string;
  /** Scopes to request */
  scopes?: string[];
  /** Where the provider should redirect after auth — must match what's
   *  registered with the provider. Defaults to our static callback. */
  redirectUri?: string;
}

export interface OAuthState {
  /** PKCE code verifier — kept server-side, sent at exchange time */
  codeVerifier: string;
  /** Server-generated state token to defeat CSRF */
  state: string;
  /** ISO timestamp when the state was created */
  createdAt: string;
  /** Stored after successful exchange */
  tokens?: OAuthTokens;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  /** Unix epoch ms when the access token expires */
  expiresAt?: number;
  scope?: string;
}

export interface InitiateResult {
  authorizationUrl: string;
  state: string;
}

// ── PKCE helpers ────────────────────────────────────────────────────────────

/**
 * Base64URL encode a buffer (RFC 7636 §4). Standard base64 with `+/=`
 * stripped/replaced.
 */
function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  // 32 bytes → 43 chars after base64url
  return base64UrlEncode(randomBytes(32));
}

function deriveCodeChallenge(verifier: string): string {
  return base64UrlEncode(createHash("sha256").update(verifier).digest());
}

function generateState(): string {
  return base64UrlEncode(randomBytes(24));
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the authorization URL + state for an OAuth initiate. The
 * caller is responsible for persisting the returned state into the
 * agsDraftMcpServers.oauthState column (encrypted).
 *
 * Returns {authorizationUrl, state} where state is the OAuthState
 * object that should be stored.
 */
export function buildAuthorizationUrl(config: OAuthConfig): {
  authorizationUrl: string;
  state: OAuthState;
} {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);
  const stateToken = generateState();

  // Default redirect URI uses our static HTML callback. Production
  // deployments override via the config.
  const redirectUri =
    config.redirectUri ?? "http://localhost:3000/agent-studio/mcp/oauth-callback.html";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    state: stateToken,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  if (config.scopes && config.scopes.length > 0) {
    params.set("scope", config.scopes.join(" "));
  }

  const sep = config.authorizationUrl.includes("?") ? "&" : "?";
  const authorizationUrl = `${config.authorizationUrl}${sep}${params.toString()}`;

  return {
    authorizationUrl,
    state: {
      codeVerifier,
      state: stateToken,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Exchange an authorization code for access + refresh tokens.
 * Uses the standard OAuth 2.0 token endpoint with PKCE.
 *
 * The caller is responsible for verifying that the `state` returned
 * by the provider matches the one stored in OAuthState.state.
 */
export async function exchangeCodeForTokens(input: {
  config: OAuthConfig;
  code: string;
  codeVerifier: string;
}): Promise<OAuthTokens> {
  const { config, code, codeVerifier } = input;
  const redirectUri =
    config.redirectUri ?? "http://localhost:3000/agent-studio/mcp/oauth-callback.html";

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    code_verifier: codeVerifier,
  });
  if (config.clientSecret) {
    body.set("client_secret", config.clientSecret);
  }

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(
      `OAuth token exchange failed: HTTP ${res.status} — ${errText.slice(0, 200)}`
    );
  }

  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch (e) {
    throw new Error(
      `OAuth token response not JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const accessToken = json.access_token;
  if (typeof accessToken !== "string") {
    throw new Error("OAuth token response missing access_token");
  }
  const tokenType = (json.token_type as string) ?? "Bearer";
  const refreshToken =
    typeof json.refresh_token === "string" ? json.refresh_token : undefined;
  const scope = typeof json.scope === "string" ? json.scope : undefined;
  let expiresAt: number | undefined;
  if (typeof json.expires_in === "number") {
    expiresAt = Date.now() + json.expires_in * 1000;
  }

  return { accessToken, tokenType, refreshToken, scope, expiresAt };
}

/**
 * Refresh an access token using a stored refresh token. Returns null
 * if no refresh token is available.
 */
export async function refreshAccessToken(input: {
  config: OAuthConfig;
  refreshToken: string;
}): Promise<OAuthTokens> {
  const { config, refreshToken } = input;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
  });
  if (config.clientSecret) body.set("client_secret", config.clientSecret);

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(
      `OAuth refresh failed: HTTP ${res.status} — ${errText.slice(0, 200)}`
    );
  }
  const json = (await res.json()) as Record<string, unknown>;
  const accessToken = json.access_token;
  if (typeof accessToken !== "string") {
    throw new Error("OAuth refresh response missing access_token");
  }
  return {
    accessToken,
    tokenType: (json.token_type as string) ?? "Bearer",
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : refreshToken,
    expiresAt:
      typeof json.expires_in === "number"
        ? Date.now() + json.expires_in * 1000
        : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
  };
}
