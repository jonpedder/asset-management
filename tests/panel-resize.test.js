import test from "node:test";
import assert from "node:assert/strict";
import { clampInventoryWidth, inventoryWidthBounds } from "../src/panel-resize.js";

test("inventory list width stays within usable workspace bounds", () => {
  assert.deepEqual(inventoryWidthBounds(1200), { min: 430, max: 850 });
  assert.equal(clampInventoryWidth(200, 1200), 430);
  assert.equal(clampInventoryWidth(480, 1200), 480);
  assert.equal(clampInventoryWidth(900, 1200), 850);
});

test("narrow workspaces retain room for the map", () => {
  assert.deepEqual(inventoryWidthBounds(800), { min: 430, max: 450 });
  assert.equal(clampInventoryWidth(500, 800), 450);
});
