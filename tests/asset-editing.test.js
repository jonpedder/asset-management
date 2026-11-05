import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  additionalEditableFields, buildServiceUpdate, coerceFieldValue, extractFacilityAddress, inferFieldBindings,
  matchFacility, serviceEditGate
} from "../src/asset-editing.js";
import { resourceFromFeature } from "../src/service-data.js";

const facility = {
  name: "County EOC",
  attributes: { F1: "100 Main St", Municipality: "Redwood City", STATE_ABBR: "CA", Postal_Code: "94063" },
  fieldAliases: { F1: "Street Address" },
  geometry: { type: "point", longitude: -122.2, latitude: 37.4 }
};

test("facility address extraction and matching use resilient exact aliases", () => {
  assert.deepEqual(extractFacilityAddress(facility), {
    name: "County EOC", address: "100 Main St", city: "Redwood City", state: "CA", zip: "94063", geometry: facility.geometry
  });
  assert.equal(matchFacility("county eoc", [facility]), facility);
  assert.equal(matchFacility("unknown", [facility]), null);
});

test("field binding is conservative and leaves ambiguous aliases unbound", () => {
  const fields = [
    { name: "AssetType", alias: "Asset Type", type: "string" }, { name: "Qty", alias: "Quantity", type: "integer" },
    { name: "OtherQty", alias: "Quantity", type: "integer" }, { name: "OBJECTID", alias: "Object ID", type: "oid" },
    { name: "CustomCode", alias: "Custom Code", type: "string", editable: true }
  ];
  const bindings = inferFieldBindings(fields);
  assert.equal(bindings.assetType, "AssetType");
  assert.equal(bindings.quantityRaw, undefined);
  assert.ok(additionalEditableFields(fields, bindings, "OBJECTID").some((field) => field.name === "CustomCode"));
  assert.ok(!additionalEditableFields(fields, bindings, "OBJECTID").some((field) => field.name === "OBJECTID"));
});

test("service value coercion validates nullability, ranges, domains, and types", () => {
  assert.deepEqual(coerceFieldValue("4", { name: "Qty", alias: "Quantity", type: "integer", nullable: false, domain: { range: [1, 10] } }), { value: 4 });
  assert.match(coerceFieldValue("11", { name: "Qty", alias: "Quantity", type: "integer", domain: { range: [1, 10] } }).error, /between/);
  assert.match(coerceFieldValue("", { name: "Name", alias: "Name", type: "string", nullable: false }).error, /required/);
  assert.equal(coerceFieldValue("A", { name: "Status", type: "string", domain: { codedValues: [{ name: "Active", code: "A" }] } }).value, "A");
});

test("service update gating and payload preserve original attributes and object id", () => {
  const record = { objectId: 7, attributes: { OBJECTID: 7, Untouched: "keep", AssetType: "Old" }, geometry: { type: "point", x: 1, y: 2 } };
  const layer = { objectIdField: "OBJECTID", capabilities: { operations: { supportsUpdate: true } }, fields: [
    { name: "OBJECTID", type: "oid", editable: false }, { name: "AssetType", alias: "Asset Type", type: "string", editable: true }, { name: "Extra", type: "double", editable: true }
  ] };
  assert.equal(serviceEditGate({ signedIn: false, layer, record }).allowed, false);
  assert.equal(serviceEditGate({ signedIn: true, layer, record }).allowed, true);
  const update = buildServiceUpdate(record, { assetType: "New" }, layer, { assetType: "AssetType" }, { Extra: "2.5" });
  assert.deepEqual(update.feature.attributes, { OBJECTID: 7, Untouched: "keep", AssetType: "New", Extra: 2.5 });
  const lockedLayer = { ...layer, fields: layer.fields.map((field) => field.name === "AssetType" ? { ...field, editable: false } : field) };
  const lockedUpdate = buildServiceUpdate(record, { assetType: "Must not change" }, lockedLayer, { assetType: "AssetType" });
  assert.equal(lockedUpdate.feature.attributes.AssetType, "Old");
});

test("service records without a real object id cannot pass the edit gate", () => {
  const record = resourceFromFeature({ attributes: { AssetType: "Pump" }, geometry: null }, 0, [{ name: "AssetType", alias: "Asset Type", type: "string" }], "OBJECTID");
  assert.equal(record.objectId, null);
  assert.equal(serviceEditGate({ signedIn: true, layer: { objectIdField: "OBJECTID", capabilities: { operations: { supportsUpdate: true } } }, record }).allowed, false);
});

test("detail form and applyEdits source keep explicit gating and mockable SDK calls", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /id="editAssetButton"/);
  assert.match(app, /id="assetEditForm"/);
  assert.match(app, /const form = event\.target/);
  assert.match(app, /Array\.from\(form\.elements\)/);
  assert.match(app, /Existing facility/);
  assert.match(app, /Enter and locate an address/);
  assert.match(app, /id="pickAssetPoint"/);
  assert.match(app, /id="locateAssetDevice"/);
  assert.match(app, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(app, /system fields remain intentionally read-only/);
  assert.match(app, /serviceEditGate\(\{ signedIn: state\.signedIn/);
  assert.match(app, /resourceLayer\.applyEdits\(\{ updateFeatures: \[update\.feature\] \}\)/);
  assert.match(app, /@arcgis\/core\/rest\/locator\.js/);
  assert.match(app, /geocodeEditor\(false\)/);
  assert.match(app, /geocodeEditor\(true\)/);
  assert.doesNotMatch(app, /fetch\(|token=/);
});
