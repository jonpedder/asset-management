import test from "node:test";
import assert from "node:assert/strict";
import { RESOURCE_SYMBOLS, resourceLabelingInfo, resourceRenderer, resourceSymbolFor } from "../src/resource-symbols.js";

test("resource categories resolve to representative picture symbols", () => {
  assert.equal(resourceSymbolFor({ category: "Communications" }).icon, "tower-broadcast");
  assert.equal(resourceSymbolFor({ category: "Public Works" }).icon, "helmet-safety");
  assert.equal(resourceSymbolFor({ category: "Emergency Medical Services" }).icon, "kit-medical");
  assert.equal(resourceSymbolFor({ category: "Hazardous Materials" }).icon, "biohazard");
  assert.equal(resourceSymbolFor({ category: "Other" }).icon, "boxes-stacked");
  assert.ok(RESOURCE_SYMBOLS.every((symbol) => symbol.url.endsWith(`${symbol.icon}.svg`)));
});

test("resource renderer uses the category field and picture markers", () => {
  const renderer = resourceRenderer("NIMS_Category");
  assert.equal(renderer.type, "unique-value");
  assert.match(renderer.valueExpression, /NIMS_Category/);
  assert.ok(renderer.uniqueValueInfos.length >= 10);
  assert.ok(renderer.uniqueValueInfos.every((info) => info.symbol.type === "picture-marker" && info.symbol.url.endsWith(".svg") && info.symbol.width === "14pt"));
});

test("resource labels appear only at metropolitan scale and closer", () => {
  const [label] = resourceLabelingInfo("ResourceName");
  assert.match(label.labelExpressionInfo.expression, /ResourceName/);
  assert.equal(label.minScale, 250000);
  assert.equal(label.maxScale, 0);
});
