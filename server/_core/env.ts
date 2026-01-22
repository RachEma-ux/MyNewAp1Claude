export const ENV = {
  // App ID can come from VITE_APP_ID (build-time) or APP_ID (runtime)
  appId: process.env.VITE_APP_ID || process.env.APP_ID || "",
  // Cookie secret: prefer COOKIE_SECRET, fallback to JWT_SECRET
  cookieSecret: process.env.COOKIE_SECRET || process.env.JWT_SECRET || "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  isDevMode: process.env.DEV_MODE === "true",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

// Validation helper for OAuth configuration
export function validateOAuthConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!ENV.appId) missing.push("APP_ID or VITE_APP_ID");
  if (!ENV.oAuthServerUrl) missing.push("OAUTH_SERVER_URL");
  if (!ENV.cookieSecret) missing.push("COOKIE_SECRET or JWT_SECRET");

  return {
    valid: missing.length === 0,
    missing,
  };
}

// Log OAuth configuration status on startup (only in non-dev mode)
if (!ENV.isDevMode && ENV.isProduction) {
  const { valid, missing } = validateOAuthConfig();
  if (!valid) {
    console.warn("[Auth] ⚠️  OAuth configuration incomplete. Missing:", missing.join(", "));
    console.warn("[Auth] OAuth login will not work without proper configuration.");
  } else {
    console.log("[Auth] ✅ OAuth configuration validated");
  }
}
