import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("runtime uses the required SDK loader and registered OAuth callback", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const config = JSON.parse(await readFile(new URL("../config/app.json", import.meta.url), "utf8"));
  assert.match(html, /<script type="module" src="https:\/\/js\.arcgis\.com\/5\.1\/"><\/script>/);
  assert.equal(config.oauth.clientId, "2eURPxapfMdaZiS7");
  assert.equal(config.oauth.popupCallbackUrl, "https://jonpedder.github.io/resource-asset-management/oauth-callback.html");
  assert.equal(config.layers.resources, 0);
  assert.equal(config.layers.facilities, 1);
});
