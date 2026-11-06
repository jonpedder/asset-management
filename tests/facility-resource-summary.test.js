import assert from "node:assert/strict";
import test from "node:test";
import { summarizeFacilityResources } from "../src/facility-resource-summary.js";

test("facility resource summary groups available quantities by type", () => {
  const resources = [
    { assetType: "Ambulance", locationName: "North EOC", availability: "Available", quantity: { estimate: 3 } },
    { assetType: "Ambulance", locationName: " north eoc ", status: "Ready", quantity: { raw: "2" } },
    { assetType: "Generator", locationName: "North EOC", availability: "Available", quantity: { estimate: 1 } },
    { assetType: "Generator", locationName: "North EOC", availability: "Committed", quantity: { estimate: 8 } },
    { assetType: "Ambulance", locationName: "South EOC", availability: "Available", quantity: { estimate: 20 } }
  ];
  const summary = summarizeFacilityResources(resources, "North EOC");
  assert.equal(summary.totalQuantity, 6);
  assert.equal(summary.totalRecords, 3);
  assert.deepEqual(summary.types, [
    { type: "Ambulance", quantity: 5, records: 2 },
    { type: "Generator", quantity: 1, records: 1 }
  ]);
});

test("facility resource summary returns an empty breakdown when none are available", () => {
  assert.deepEqual(summarizeFacilityResources([{ assetType: "Truck", locationName: "Depot", availability: "Unavailable", quantity: { estimate: 4 } }], "Depot").types, []);
});
