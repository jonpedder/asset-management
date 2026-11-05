import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  cleanSelectedIds, facilityFilterOptions, filterResourceRecords, planBulkFacilityAssignment, summarizeServiceUpdateResults
} from "../src/inventory-operations.js";

const records = [
  { id: "a", assetType: "Pump", department: "Water", category: "Utility", status: "Ready", source: "Current", sourceType: "service", facility: "Main Yard", city: "Redwood City", zip: "94063" },
  { id: "b", assetType: "Truck", department: "Roads", category: "Fleet", status: "Ready", source: "Import", sourceType: "import", locationName: "North Yard", city: "San Mateo", zip: "94401" }
];
const facility = { id: "f1", name: "Main Yard", attributes: { Address: "1 Main St", City: "Redwood City", State: "CA", ZIP: "94063" }, geometry: { type: "point", x: 1, y: 2, spatialReference: { wkid: 4326 } } };
const fields = [
  { name: "OBJECTID", type: "oid", editable: false },
  { name: "LocationName", alias: "Location Name", type: "string", editable: true },
  { name: "City", alias: "City", type: "string", editable: true },
  { name: "LockedZip", alias: "ZIP", type: "string", editable: false }
];
const layer = { objectIdField: "OBJECTID", geometryType: "point", capabilities: { operations: { supportsUpdate: true } }, fields };

test("combined inventory filters use exact normalized facility and case-insensitive city and ZIP matching", () => {
  assert.deepEqual(filterResourceRecords(records, { search: "pump", source: "service", facility: "  MAIN   YARD ", city: "REDWOOD", zip: "406" }).map((record) => record.id), ["a"]);
  assert.equal(filterResourceRecords(records, { facility: "yard" }).length, 0);
  assert.equal(filterResourceRecords(records, {}).length, 2);
});

test("facility options combine loaded facilities with distinct asset locations", () => {
  const options = facilityFilterOptions([facility], records);
  assert.deepEqual(options.map((option) => option.label), ["Main Yard", "North Yard"]);
});

test("selection cleanup preserves existing IDs and drops stale IDs", () => {
  assert.deepEqual([...cleanSelectedIds(new Set(["a", "missing", "b"]), records)], ["a", "b"]);
});

test("bulk plan gates service updates and builds one conservative geometry plus location payload", () => {
  const service = { ...records[0], objectId: 7, attributes: { OBJECTID: 7, Keep: "yes", LocationName: "Old", City: "Old", LockedZip: "old" }, geometry: null };
  assert.throws(() => planBulkFacilityAssignment({ selectedRecords: [service], facility, signedIn: false, layer }), /Sign in/);
  const plan = planBulkFacilityAssignment({ selectedRecords: [service, records[1]], facility, signedIn: true, layer });
  assert.equal(plan.serviceFeatures.length, 1);
  assert.deepEqual(plan.importedIds, ["b"]);
  assert.deepEqual(plan.serviceFeatures[0].attributes, { OBJECTID: 7, Keep: "yes", LocationName: "Main Yard", City: "Redwood City", LockedZip: "old" });
  assert.equal(plan.serviceFeatures[0].geometry, facility.geometry);
  assert.deepEqual(plan.editableLocationFields, ["locationName", "city"]);
  assert.equal(plan.geometryOnly, false);
});

test("bulk plan rejects demo, missing IDs, unsupported layers, and permits disclosed geometry-only service updates", () => {
  assert.throws(() => planBulkFacilityAssignment({ selectedRecords: [{ id: "d", sourceType: "demo" }], facility }), /demo/i);
  assert.throws(() => planBulkFacilityAssignment({ selectedRecords: [{ id: "s", sourceType: "service", objectId: null }], facility, signedIn: true, layer }), /object ID/i);
  assert.throws(() => planBulkFacilityAssignment({ selectedRecords: [{ id: "s", sourceType: "service", objectId: 1 }], facility, signedIn: true, layer: { ...layer, capabilities: { operations: { supportsUpdate: false } } } }), /update support/i);
  const geometryOnly = planBulkFacilityAssignment({ selectedRecords: [{ id: "s", sourceType: "service", objectId: 1, attributes: { OBJECTID: 1, Keep: "yes" } }], facility, signedIn: true, layer: { ...layer, fields: [fields[0]] } });
  assert.equal(geometryOnly.geometryOnly, true);
  assert.deepEqual(geometryOnly.serviceFeatures[0].attributes, { OBJECTID: 1, Keep: "yes" });
});

test("partial service result summary reports exact successes, failures, and IDs", () => {
  const selected = [{ id: "s1", objectId: 1 }, { id: "s2", objectId: 2 }, { id: "s3", objectId: 3 }];
  const summary = summarizeServiceUpdateResults({ updateFeatureResults: [{ objectId: 1 }, { objectId: 2, error: { message: "denied" } }] }, selected);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.failureCount, 2);
  assert.deepEqual(summary.successfulObjectIds, [1]);
  assert.deepEqual(summary.failures.map((failure) => failure.message), ["denied", "No update result was returned."]);
});

test("DOM and runtime source use checkbox selection, one bulk batch, strict session API, and no raw fetch", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8")
  ]);
  assert.match(html, /id="facilityFilter"/);
  assert.match(html, /id="cityFilter"/);
  assert.match(html, /id="zipFilter"/);
  assert.match(html, /id="selectAllVisible"/);
  assert.match(html, /id="applyBulkFacility"/);
  assert.match(app, /applyEdits\(\{ updateFeatures: plan\.serviceFeatures \}\)/);
  assert.match(app, /updateImportSessionRecords\(plan\.importedIds/);
  assert.match(app, /event\.target\.closest\("input, button, select, label"\)/);
  assert.doesNotMatch(app, /fetch\(|token=/);
});
