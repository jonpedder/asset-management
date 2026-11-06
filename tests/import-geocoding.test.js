import assert from "node:assert/strict";
import test from "node:test";
import { applyGeocodeCandidates, buildGeocodePlan, geocodeQuery } from "../src/import-geocoding.js";

test("geocode plan detects location data and deduplicates equivalent addresses", () => {
  const records = [
    { address: "100 Main St", city: "Boise", state: "ID", zip: "83702" },
    { address: "100 MAIN ST", city: "Boise", state: "ID", zip: "83702" },
    { locationName: "North Staging Area" },
    { assetType: "No location" },
    { address: "Already mapped", geometry: { type: "point", x: 1, y: 2 } }
  ];
  assert.equal(geocodeQuery(records[0]), "100 Main St, Boise, ID, 83702");
  const plan = buildGeocodePlan(records);
  assert.equal(plan.length, 2);
  assert.deepEqual(plan[0].recordIndexes, [0, 1]);
  assert.deepEqual(plan[1].recordIndexes, [2]);
});

test("accepted geocode candidates add reusable point geometry and preserve unresolved rows", () => {
  const records = [{ assetType: "A", address: "One" }, { assetType: "B", address: "Two" }];
  const plan = buildGeocodePlan(records);
  const result = applyGeocodeCandidates(records, plan, [
    { resultId: plan[0].id, score: 96, location: { x: -116.2, y: 43.6, spatialReference: { wkid: 4326 } } },
    { resultId: plan[1].id, score: 40, location: { x: 0, y: 0, spatialReference: { wkid: 4326 } } }
  ]);
  assert.equal(result.geocoded, 1);
  assert.equal(result.unresolved, 1);
  assert.match(result.records[0].locationMethod, /^Geocoded address from imported CSV/);
  assert.equal(result.records[0].geometry.spatialReference.wkid, 4326);
  assert.equal(result.records[1].geometry, undefined);
});
