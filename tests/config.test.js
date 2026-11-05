import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG_OVERRIDE_KEY, clearConfigOverrides, loadConfig, mergeConfig, readConfigOverrides, saveConfigOverrides } from "../src/config.js";

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values };
}
const base = { portalUrl: "https://example.com", featureServiceItemId: "a".repeat(32), webMapItemId: "b".repeat(32), serviceUrl: "https://example.com/FeatureServer", layers: { resources: 0, facilities: 1 }, oauth: { enabled: true, clientId: "public-id", mode: "redirect", redirectUrl: "https://example.com/app/" }, map: { basemap: "dark-gray-vector", center: { longitude: -120, latitude: 37 }, zoom: 9 }, import: { maxFileBytes: 1000000 } };

test("config merge preserves nested deployment values and applies safe overrides", () => {
  const merged = mergeConfig(base, { map: { zoom: 12 }, oauth: { clientId: "other-public-id" }, token: "no", clientSecret: "no" });
  assert.equal(merged.map.zoom, 12); assert.equal(merged.map.center.longitude, -120); assert.equal(merged.oauth.mode, "redirect"); assert.equal(merged.oauth.clientId, "other-public-id"); assert.equal("token" in merged, false); assert.equal("clientSecret" in merged, false);
});

test("config overrides save, read, and clear using local storage", () => {
  const store = storage();
  saveConfigOverrides({ branding: { appName: "County Assets" }, token: "discard" }, store);
  assert.equal(readConfigOverrides(store).branding.appName, "County Assets"); assert.doesNotMatch(store.values.get(CONFIG_OVERRIDE_KEY), /discard/);
  clearConfigOverrides(store); assert.deepEqual(readConfigOverrides(store), {});
});

test("loadConfig fetches deployment config and merges local overrides", async () => {
  const store = storage(); saveConfigOverrides({ map: { zoom: 13 } }, store);
  const config = await loadConfig("config.json", { storage: store, fetch: async () => ({ ok: true, json: async () => base }) });
  assert.equal(config.map.zoom, 13); assert.equal(config.layers.facilities, 1);
});
