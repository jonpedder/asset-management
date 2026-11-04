import test from "node:test";
import assert from "node:assert/strict";
import { extractCsvRecords, inspectCsv, mapCsvRecords, parseCsv } from "../src/csv.js";

const headers = "Asset Type,Dept,Category,Est. Qty,Availability,EOC Role / Use,Operator Required?,Status,Gap Description,Procurement Priority,Est. Unit Cost,Notes / Source";

test("parser supports quoted commas, escaped quotes, and line breaks", () => {
  const rows = parseCsv('a,"b, c","line 1\nline 2","say ""yes"""\r\n1,2,3,4');
  assert.deepEqual(rows[0], ["a", "b, c", "line 1\nline 2", 'say "yes"']);
  assert.equal(rows[1][0], "1");
});

test("extractor finds header and ignores draft scaffolding rows", () => {
  const csv = `INTERNAL DRAFT\nSummary: planning worksheet\n\n${headers}\nSECTION: POWER\nGenerator,Public Works,Power,2 - 4,Ready,Backup power,Yes,Operational,None,High,$1,Source memo\nDisclaimer: estimates only`;
  const result = extractCsvRecords(csv);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]["Asset Type"], "Generator");
  assert.equal(result.headerRow, 4);
  assert.ok(result.ignoredRows >= 4);
});

test("extractor preserves the 32-row customer draft behavior", () => {
  const dataRows = Array.from({ length: 32 }, (_, index) => `Asset ${index + 1},Dept ${index % 4},Category,1 - 2,Ready,Role,No,Operational,None,Medium,$100,Source`).join("\n");
  const csv = `INTERNAL DRAFT\nSummary: 32-row worksheet\n\n${headers}\nSECTION: INVENTORY\n${dataRows}\nDisclaimer: estimates only\n`;
  const result = extractCsvRecords(csv);
  assert.equal(result.records.length, 32);
  assert.equal(result.headerRow, 4);
  assert.ok(result.ignoredRows >= 5);
});

test("automatic mapping uses exact normalized aliases for documented headings", () => {
  const inspection = inspectCsv(`${headers}\nGenerator,Public Works,Power,2,Ready,Backup,Yes,Operational,None,High,$100,Memo`);
  assert.equal(inspection.headerRow, 1);
  assert.deepEqual(Object.values(inspection.suggestedMapping), Array.from({ length: 12 }, (_, index) => index));
  const result = mapCsvRecords(inspection, inspection.suggestedMapping);
  assert.equal(result.records[0].assetType, "Generator");
  assert.equal(result.records[0].quantity, "2");
});

test("explicit mapping supports arbitrary custom headings", () => {
  const inspection = inspectCsv("Equipment label,Owning team,Count on hand,Free text\nPortable pump,Utilities,7,Trailer mounted");
  const result = mapCsvRecords(inspection, { assetType: 0, department: 1, quantity: 2, notes: 3 });
  assert.deepEqual(result.records[0], {
    assetType: "Portable pump", department: "Utilities", category: "", quantity: "7", availability: "",
    eocRole: "", operator: "", status: "", gapDescription: "", priority: "", unitCost: "", notes: "Trailer mounted"
  });
});

test("mapping requires Asset Type and rejects duplicate source assignments", () => {
  const inspection = inspectCsv("Thing,Team\nPump,Utilities");
  assert.throws(() => mapCsvRecords(inspection, { department: 1 }), /Asset Type mapping is required/i);
  assert.throws(() => mapCsvRecords(inspection, { assetType: 0, category: 0 }), /Duplicate assignment/i);
});

test("inspection reports malformed and unusable CSV clearly", () => {
  assert.throws(() => inspectCsv(""), /empty/i);
  assert.throws(() => inspectCsv('Asset Type\n"Pump'), /closing quote/i);
  assert.throws(() => inspectCsv("Asset Type"), /header row/i);
});

test("extractor rejects an unrelated CSV", () => {
  assert.throws(() => extractCsvRecords("name,value\na,1"), /header row/i);
});
