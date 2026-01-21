export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Check if OAuth is configured
export const isOAuthConfigured = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  return !!(oauthPortalUrl && appId && oauthPortalUrl !== 'undefined');
};

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  // Return empty string if OAuth is not configured
  // Check for various falsy/invalid values that could come from env vars
  if (!oauthPortalUrl || !appId ||
      oauthPortalUrl === 'undefined' ||
      oauthPortalUrl === 'null' ||
      oauthPortalUrl.trim() === '' ||
      !oauthPortalUrl.startsWith('http')) {
    // Only warn in development to avoid console noise in production
    if (import.meta.env.DEV) {
      console.warn('OAuth not configured: VITE_OAUTH_PORTAL_URL or VITE_APP_ID missing or invalid');
    }
    return '';
  }

  try {
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const state = btoa(redirectUri);

    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    return url.toString();
  } catch (error) {
    // If URL construction fails for any reason, return empty string
    console.error('Failed to construct login URL:', error);
    return '';
  }
};
