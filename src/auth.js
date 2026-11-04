let identityManager;
let oauthInfo;
let oauthRedirectUrl = "";
let redirectMode = false;

export async function initializeAuth(config) {
  const [OAuthInfo, IdentityManager] = await $arcgis.import([
    "@arcgis/core/identity/OAuthInfo.js",
    "@arcgis/core/identity/IdentityManager.js"
  ]);
  identityManager = IdentityManager;
  redirectMode = config.oauth?.mode === "redirect";
  oauthRedirectUrl = config.oauth?.redirectUrl || "";
  if (config.oauth?.enabled && config.oauth?.clientId) {
    oauthInfo = new OAuthInfo({
      appId: config.oauth.clientId,
      portalUrl: config.portalUrl.replace(/\/$/, ""),
      popup: !redirectMode,
      popupCallbackUrl: config.oauth.popupCallbackUrl
    });
    identityManager.registerOAuthInfos([oauthInfo]);
  }

  let signedIn = false;
  if (oauthInfo) {
    try {
      await identityManager.checkSignInStatus(`${oauthInfo.portalUrl}/sharing`);
      signedIn = true;
    } catch {
      signedIn = false;
    }
  }
  return { oauthConfigured: Boolean(oauthInfo), signedIn };
}

export async function signIn() {
  if (!identityManager || !oauthInfo) throw new Error("OAuth is not configured for this deployment.");
  if (redirectMode && oauthRedirectUrl) {
    const redirect = new URL(oauthRedirectUrl, window.location.href);
    if (redirect.origin !== window.location.origin) throw new Error("OAuth redirect URL must use the application origin.");
    // Canonicalize the URL so IdentityManager sends the exact registered redirect URI.
    window.history.replaceState(window.history.state, "", `${redirect.pathname}${redirect.search}${redirect.hash}`);
  }
  await identityManager.getCredential(`${oauthInfo.portalUrl}/sharing`, { oAuthPopupConfirmation: false });
  return true;
}

export function signOut() {
  identityManager?.destroyCredentials();
}

export async function probeAnonymousAccess(layerUrl) {
  try {
    const response = await fetch(`${layerUrl}?f=json`, { credentials: "omit", cache: "no-store" });
    if (!response.ok) return { accessible: false, reason: `HTTP ${response.status}` };
    const payload = await response.json();
    if (payload.error) return { accessible: false, reason: payload.error.message || "Authentication required" };
    return { accessible: Boolean(payload.type || payload.geometryType || payload.fields), reason: "Anonymous service metadata loaded" };
  } catch (error) {
    return { accessible: false, reason: error.message || "Anonymous request failed" };
  }
}
