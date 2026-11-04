import test from "node:test";
import assert from "node:assert/strict";
import { clearImportSession, IMPORT_SESSION_KEY, readImportSession, saveImportSession } from "../src/import-session.js";
import { normalizeImportedRecord } from "../src/normalize.js";
import { inspectCsv, mapCsvRecords } from "../src/csv.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values
  };
}

const normalized = normalizeImportedRecord({
  "Asset Type": "Generator", Dept: "Public Works", Category: "Power", "Est. Qty": "2 - 4",
  Availability: "Ready", "EOC Role / Use": "Backup", "Operator Required?": "Yes", Status: "Operational",
  "Gap Description": "None", "Procurement Priority": "High", "Est. Unit Cost": "$1,000", "Notes / Source": "Draft"
});

test("import session saves, reads, and clears normalized records in supplied session storage", () => {
  const store = storage();
  const saved = saveImportSession([normalized], { ignoredRows: 6, headerRow: 4 }, store);
  assert.equal(saved.records.length, 1);
  assert.equal(readImportSession(store).records[0].assetType, "Generator");
  assert.equal(readImportSession(store).ignoredRows, 6);
  assert.doesNotMatch(store.values.get(IMPORT_SESSION_KEY), /"raw":\{/);
  clearImportSession(store);
  assert.equal(readImportSession(store), null);
});

test("explicit field mappings flow through normalization into session staging", () => {
  const store = storage();
  const inspection = inspectCsv("Equipment,Owner,On hand,Cost each\nPump,Utilities,3 - 5,$250");
  const mapped = mapCsvRecords(inspection, { assetType: 0, department: 1, quantity: 2, unitCost: 3 });
  const saved = saveImportSession(mapped.records.map(normalizeImportedRecord), mapped, store);
  assert.equal(saved.records[0].assetType, "Pump");
  assert.equal(saved.records[0].department, "Utilities");
  assert.equal(saved.records[0].quantity.min, 3);
  assert.equal(saved.records[0].unitCost.estimate, 250);
});

test("import session rejects empty or oversized record sets and discards invalid stored shapes", () => {
  const store = storage();
  assert.throws(() => saveImportSession([], {}, store), /did not contain/i);
  assert.throws(() => saveImportSession(Array.from({ length: 5001 }, () => normalized), {}, store), /record session limit/i);
  store.setItem(IMPORT_SESSION_KEY, JSON.stringify({ version: 1, records: [{ assetType: "unsafe" }] }));
  assert.equal(readImportSession(store), null);
  assert.equal(store.getItem(IMPORT_SESSION_KEY), null);
});
