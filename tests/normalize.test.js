import test from "node:test";
import assert from "node:assert/strict";
import { cleanText, normalizeOperator, normalizePriority, normalizeStatus, parseRange } from "../src/normalize.js";

test("normalizes broken separators and mojibake", () => {
  assert.equal(cleanText("10 ? 20"), "10 - 20");
  assert.equal(cleanText("Aâ€“B"), "A-B");
});

test("parses quantity and currency ranges", () => {
  assert.deepEqual(parseRange("10 - 20"), { raw: "10 - 20", min: 10, max: 20, estimate: 15, currency: false });
  assert.deepEqual(parseRange("$1,200 – $1,800", { currency: true }), { raw: "$1,200 - $1,800", min: 1200, max: 1800, estimate: 1500, currency: true });
});

test("normalizes controlled domains", () => {
  assert.equal(normalizeStatus("Have"), "Have");
  assert.equal(normalizeStatus("Gap - Need More"), "Gap — Need More");
  assert.equal(normalizeStatus("Partial"), "Partial");
  assert.equal(normalizePriority("P1 - Critical"), "P1 — Critical");
  assert.equal(normalizePriority("P2 - High"), "P2 — High");
  assert.equal(normalizeOperator("Yes - Certified Operator"), "Certified operator required");
  assert.equal(normalizeOperator("Yes - CDL Required"), "CDL required");
  assert.equal(normalizeOperator("Yes - Licensed Only"), "Licensed operator required");
  assert.equal(normalizeOperator("No"), "Not required");
});
