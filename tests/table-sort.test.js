import test from "node:test";
import assert from "node:assert/strict";
import { sortRows } from "../src/table-sort.js";

const rows = [
  { id: "b", name: "Bravo 10", quantity: { estimate: 10 } },
  { id: "a", name: "alpha 2", quantity: { estimate: 2 } },
  { id: "m", name: "", quantity: { estimate: null } }
];

test("table sorting supports ascending and descending text values", () => {
  const accessors = { name: (record) => record.name };
  assert.deepEqual(sortRows(rows, { key: "name", direction: "asc" }, accessors).map((row) => row.id), ["a", "b", "m"]);
  assert.deepEqual(sortRows(rows, { key: "name", direction: "desc" }, accessors).map((row) => row.id), ["m", "b", "a"]);
});

test("table sorting supports numeric accessors without mutating source rows", () => {
  const original = [...rows];
  const sorted = sortRows(rows, { key: "quantity", direction: "desc" }, { quantity: (record) => record.quantity.estimate });
  assert.deepEqual(sorted.map((row) => row.id), ["m", "b", "a"]);
  assert.deepEqual(rows, original);
});
