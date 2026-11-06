export const CONFIG_OVERRIDE_KEY = "asset-management-config-overrides-v1";

const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const scalar = (value) => ["string", "number", "boolean"].includes(typeof value) ? value : undefined;
const allowed = {
  portalUrl: true, featureServiceItemId: true, webMapItemId: true, webMapUrl: true, serviceUrl: true,
  layers: ["resources", "facilities"],
  oauth: ["enabled", "clientId", "mode", "redirectUrl", "popupCallbackUrl"],
  map: ["basemap", "center", "zoom"], import: ["maxFileBytes", "privacyNote"],
  branding: ["appName", "subtitle", "logoUrl", "colors"],
  labels: ["inventoryHeading", "resourcesTab", "facilitiesTab", "settingsImport", "selectionHeading"],
  statusColors: ["available", "limited", "unavailable", "unknown"], resourceColors: ["current", "imported", "mocked", "demo"],
  symbols: ["resourceIconUrl", "facilityIconUrl"],
  operatorDefaults: ["showMockedPoints", "compactInventory", "defaultSourceFilter"]
};

function pickMap(source, keys) {
  const result = {};
  for (const key of keys) if (scalar(source[key]) !== undefined) result[key] = source[key];
  return result;
}

export function sanitizeConfigOverrides(value) {
  const source = object(value);
  if (!Object.keys(source).length) return {};
  const result = {};
  for (const key of ["portalUrl", "featureServiceItemId", "webMapItemId", "webMapUrl", "serviceUrl"]) if (typeof source[key] === "string") result[key] = source[key];
  result.layers = pickMap(object(source.layers), allowed.layers);
  result.oauth = pickMap(object(source.oauth), allowed.oauth);
  const map = object(source.map);
  result.map = pickMap(map, ["basemap", "zoom"]);
  result.map.center = pickMap(object(map.center), ["longitude", "latitude"]);
  result.import = pickMap(object(source.import), allowed.import);
  const branding = object(source.branding);
  result.branding = pickMap(branding, ["appName", "subtitle", "logoUrl"]);
  result.branding.colors = pickMap(object(branding.colors), ["navy", "background", "panel", "panelAlt", "panelStrong", "border", "text", "muted", "faint", "accent", "accentStrong", "blue", "green", "red", "focus"]);
  for (const key of ["labels", "statusColors", "resourceColors", "symbols"]) result[key] = pickMap(object(source[key]), allowed[key]);
  result.operatorDefaults = pickMap(object(source.operatorDefaults), allowed.operatorDefaults);
  return result;
}

function mergeObjects(base, overrides) { return { ...object(base), ...object(overrides) }; }
export function mergeConfig(baseValue, overrideValue) {
  const base = object(baseValue);
  const overrides = sanitizeConfigOverrides(overrideValue);
  return {
    ...base, ...overrides,
    layers: mergeObjects(base.layers, overrides.layers),
    oauth: mergeObjects(base.oauth, overrides.oauth),
    map: { ...mergeObjects(base.map, overrides.map), center: mergeObjects(base.map?.center, overrides.map?.center) },
    import: mergeObjects(base.import, overrides.import),
    branding: { ...mergeObjects(base.branding, overrides.branding), colors: mergeObjects(base.branding?.colors, overrides.branding?.colors) },
    labels: mergeObjects(base.labels, overrides.labels),
    statusColors: mergeObjects(base.statusColors, overrides.statusColors),
    resourceColors: mergeObjects(base.resourceColors, overrides.resourceColors),
    symbols: mergeObjects(base.symbols, overrides.symbols),
    operatorDefaults: mergeObjects(base.operatorDefaults, overrides.operatorDefaults)
  };
}

export function readConfigOverrides(storage = globalThis.localStorage) {
  try { return storage ? sanitizeConfigOverrides(JSON.parse(storage.getItem(CONFIG_OVERRIDE_KEY) || "{}")) : {}; }
  catch { return {}; }
}
export function saveConfigOverrides(value, storage = globalThis.localStorage) {
  if (!storage) throw new Error("Browser storage is unavailable.");
  const safe = sanitizeConfigOverrides(value);
  storage.setItem(CONFIG_OVERRIDE_KEY, JSON.stringify(safe));
  return safe;
}
export function clearConfigOverrides(storage = globalThis.localStorage) { storage?.removeItem(CONFIG_OVERRIDE_KEY); }

export function validateConfig(config) {
  if (!/^https:\/\//i.test(config.portalUrl || "") || !/^https:\/\//i.test(config.serviceUrl || "")) throw new Error("Portal and feature service URLs must use HTTPS.");
  if (config.webMapUrl && !/^https:\/\//i.test(config.webMapUrl)) throw new Error("Web map URL must use HTTPS.");
  for (const [label, value] of [["Resource icon", config.symbols?.resourceIconUrl], ["Facility icon", config.symbols?.facilityIconUrl]]) if (value && !/^https:\/\//i.test(value) && !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(value)) throw new Error(`${label} must use HTTPS or a supported browser-local image upload.`);
  if (!config.oauth?.clientId) throw new Error("OAuth client ID is required.");
  if (config.oauth.mode !== "redirect") throw new Error("OAuth mode must remain full-page redirect.");
  if (!/^https:\/\//i.test(config.oauth.redirectUrl || "")) throw new Error("OAuth redirect URL must use HTTPS.");
  if (!/^[a-f0-9]{32}$/i.test(config.featureServiceItemId || "")) throw new Error("Feature service item ID must contain 32 hexadecimal characters.");
  if (!/^[a-f0-9]{32}$/i.test(config.webMapItemId || "")) throw new Error("Web map item ID must contain 32 hexadecimal characters.");
  for (const key of ["resources", "facilities"]) if (!Number.isInteger(Number(config.layers?.[key])) || Number(config.layers[key]) < 0) throw new Error(`Invalid ${key} layer index.`);
  const { longitude, latitude } = config.map?.center || {};
  if (!Number.isFinite(Number(longitude)) || !Number.isFinite(Number(latitude))) throw new Error("Map center must contain numeric longitude and latitude.");
  if (!Number.isFinite(Number(config.map?.zoom)) || Number(config.map.zoom) < 0 || Number(config.map.zoom) > 23) throw new Error("Map zoom must be between 0 and 23.");
  if (!Number.isFinite(Number(config.import?.maxFileBytes)) || Number(config.import.maxFileBytes) < 1024) throw new Error("Import size limit is invalid.");
  return config;
}

export async function loadConfig(url = "./config/app.json", dependencies = {}) {
  const fetcher = dependencies.fetch || globalThis.fetch;
  const storage = dependencies.storage || globalThis.localStorage;
  const response = await fetcher(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Configuration HTTP ${response.status}`);
  return validateConfig(mergeConfig(await response.json(), readConfigOverrides(storage)));
}
