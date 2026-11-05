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

test("optimized UI exposes Web Map reuse, map controls, collapsed bulk actions, and coordinate previews", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const map = await readFile(new URL("../src/map.js", import.meta.url), "utf8");
  assert.match(map, /new WebMap\(\{ portalItem:/);
  assert.match(map, /findWebMapLayer\(config\.serviceUrl, layerId\)/);
  assert.match(map, /window\.__esriWebMap = webmap/);
  for (const control of ["mapZoomIn", "mapZoomOut", "mapHome", "mapPopupDock", "mapBookmarkSelect", "mapLegendList"]) assert.match(html, new RegExp(control));
  assert.match(map, /updateLegend\(\)/);
  assert.match(map, /updateBookmarks\(\)/);
  assert.doesNotMatch(map, /@arcgis\/core\/widgets\//);
  assert.match(map, /buttonEnabled: true/);
  assert.match(html, /<details class="bulk-section">/);
  assert.doesNotMatch(html, /Reported fleet benchmark|Location validation/);
  assert.match(app, /coordinateFields\("asset"/);
  assert.match(app, /coordinateFields\("facility"/);
  assert.match(app, /id="addNewFacility"/);
  assert.match(app, />Locate<\/button>/);
  assert.match(app, /geocodeEditor\(true\)/);
  assert.match(app, /geocodeFacility\(true\)/);
});

test("build allowlist publishes settings and runtime modules without CSV", async () => {
  const build = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(build, /"settings\.html"/);
  assert.match(build, /const runtimeFiles = \[/);
  assert.match(build, /"src\/import-session\.js"/);
  assert.match(build, /"src\/inventory-operations\.js"/);
  assert.doesNotMatch(build, /\.csv["']/i);
});
