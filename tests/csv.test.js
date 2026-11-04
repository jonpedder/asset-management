import test from "node:test";
import assert from "node:assert/strict";
import { extractCsvRecords, parseCsv } from "../src/csv.js";

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

test("extractor rejects an unrelated CSV", () => {
  assert.throws(() => extractCsvRecords("name,value\na,1"), /header row/i);
});
