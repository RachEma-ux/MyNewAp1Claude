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

// SECURITY: Validate critical environment variables in production
if (ENV.isProduction) {
  const missing: string[] = [];
  if (!process.env.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
  if (!process.env.SECRETS_ENCRYPTION_KEY) missing.push("SECRETS_ENCRYPTION_KEY");
  if (!ENV.cookieSecret) missing.push("COOKIE_SECRET or JWT_SECRET");
  if (missing.length > 0) {
    throw new Error(
      `[FATAL] Missing required environment variables for production: ${missing.join(", ")}. ` +
      "Set these before starting the server in production mode."
    );
  }
}

// SECURITY: Hard block DEV_MODE in production — auth bypass must never run in production
// Exception: CI/CD deploys can set ALLOW_DEV_MODE_IN_PROD=true for tunnel testing
if (ENV.isDevMode && ENV.isProduction && process.env.ALLOW_DEV_MODE_IN_PROD !== "true") {
  throw new Error(
    "[FATAL] DEV_MODE=true is not allowed when NODE_ENV=production. " +
    "This combination bypasses all authentication. " +
    "For staging/CI, set NODE_ENV=staging or NODE_ENV=development."
  );
}

// Log DEV_MODE status in non-production environments
if (ENV.isDevMode && !ENV.isProduction) {
  console.log("[Dev] DEV_MODE=true — authentication bypass is active (development mode).");
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
