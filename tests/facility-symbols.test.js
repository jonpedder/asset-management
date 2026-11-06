import test from "node:test";
import assert from "node:assert/strict";
import { FACILITY_SYMBOL_URL, facilityLabelingInfo, facilityRenderer } from "../src/facility-symbols.js";

test("facility renderer uses the management picture symbol at 14 points", () => {
  const renderer = facilityRenderer();
  assert.equal(renderer.type, "simple");
  assert.equal(renderer.symbol.type, "picture-marker");
  assert.equal(renderer.symbol.width, "14pt");
  assert.equal(renderer.symbol.height, "14pt");
  assert.match(FACILITY_SYMBOL_URL, /facility-management\.svg$/);
});

test("custom facility icon overrides the default symbol", () => {
  const renderer = facilityRenderer("https://example.com/facility.svg");
  assert.equal(renderer.symbol.url, "https://example.com/facility.svg");
  assert.equal(renderer.symbol.width, "14pt");
});

test("facility labels appear at metropolitan scale and closer", () => {
  const [label] = facilityLabelingInfo("SiteName");
  assert.match(label.labelExpressionInfo.expression, /SiteName/);
  assert.equal(label.minScale, 250000);
  assert.equal(label.maxScale, 0);
});
