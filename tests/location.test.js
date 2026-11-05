import test from "node:test";
import assert from "node:assert/strict";
import { assignLocations, deterministicCountyPoint } from "../src/location.js";

const records = [
  { id: "1", assetType: "Generator", department: "Public Works", category: "Power" },
  { id: "2", assetType: "Cots", department: "Shelter", category: "Mass Care" },
  { id: "3", assetType: "Radio", department: "Unknown", category: "Comms" }
];
const resources = [{ attributes: { AssetType: "Generator", Dept: "Public Works" }, geometry: { type: "point", longitude: -90, latitude: 40 } }];
const facilities = [{ attributes: { Name: "Shelter Central" }, geometry: { type: "point", longitude: -91, latitude: 41 } }];

test("location hierarchy uses resource, facility, then deterministic mock", () => {
  const result = assignLocations(records, resources, facilities, { longitude: -98, latitude: 39 });
  assert.deepEqual(result.summary, { resourceMatches: 1, facilityMatches: 1, mocked: 1, total: 3, coveragePercent: 67 });
  assert.equal(result.records[0].locationMethod, "Existing resource match");
  assert.equal(result.records[1].locationMethod, "Facility match");
  assert.equal(result.records[2].isMockLocation, true);
});

test("requested facility wins and unmatched address is preserved without hidden geocoding", () => {
  const namedFacility = { name: "County EOC", attributes: { Address: "100 Main", City: "Bayside", State: "CA", ZIP: "94000" }, geometry: { type: "point", longitude: -92, latitude: 42 } };
  const requested = assignLocations([{ ...records[0], facility: "County EOC", address: "old" }], resources, [namedFacility]);
  assert.equal(requested.records[0].locationName, "County EOC");
  assert.equal(requested.records[0].address, "100 Main");
  assert.equal(requested.records[0].isMockLocation, false);
  const unmatched = assignLocations([{ ...records[0], facility: "Missing", address: "9 Unknown" }], resources, [namedFacility]);
  assert.equal(unmatched.records[0].address, "9 Unknown");
  assert.equal(unmatched.records[0].isMockLocation, true);
  assert.match(unmatched.records[0].locationMethod, /Address retained/);
});

test("mock points are deterministic and one per input record", () => {
  assert.deepEqual(deterministicCountyPoint(records[2]), deterministicCountyPoint(records[2]));
  const result = assignLocations([{ ...records[2], quantity: { estimate: 1000 } }], [], []);
  assert.equal(result.records.length, 1);
});
