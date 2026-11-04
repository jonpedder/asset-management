import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("runtime uses the required SDK loader and full-page OAuth redirect", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const auth = await readFile(new URL("../src/auth.js", import.meta.url), "utf8");
  const config = JSON.parse(await readFile(new URL("../config/app.json", import.meta.url), "utf8"));
  assert.match(html, /<script type="module" src="https:\/\/js\.arcgis\.com\/5\.1\/"><\/script>/);
  assert.equal(config.oauth.clientId, "2eURPxapfMdaZiS7");
  assert.equal(config.oauth.mode, "redirect");
  assert.equal(config.oauth.redirectUrl, "https://jonpedder.github.io/asset-management/");
  assert.equal(config.oauth.popupCallbackUrl, "https://jonpedder.github.io/asset-management/oauth-callback.html");
  assert.match(auth, /popup:\s*!redirectMode/);
  assert.match(auth, /history\.replaceState/);
  assert.equal(config.layers.resources, 0);
  assert.equal(config.layers.facilities, 1);
});

test("build allowlist publishes settings and runtime modules without CSV", async () => {
  const build = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(build, /"settings\.html"/);
  assert.match(build, /const directories = \["src", "styles"\]/);
  assert.doesNotMatch(build, /\.csv["']/i);
});
