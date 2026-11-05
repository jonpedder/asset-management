import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  additionalFacilityFields, buildFacilityFeature, countFacilityReferences, createMapPickerLifecycle,
  deleteWarningModel, facilityEditGate, geometryCompatibility, inferFacilityBindings, selectConfidentAddressMatch
} from "../src/facility-editing.js";

const fields = [
  { name: "OBJECTID", alias: "OBJECTID", type: "oid", editable: false, nullable: false },
  { name: "FACILITY_NAME", alias: "Facility Name", type: "string", editable: true, nullable: false, length: 40 },
  { name: "FAC_TYPE", alias: "Facility Type", type: "string", editable: true, nullable: true, domain: { codedValues: [{ code: "EOC", name: "EOC" }] } },
  { name: "STATUS", alias: "Status", type: "string", editable: true, nullable: false, defaultValue: "Open" },
  { name: "CAPACITY", alias: "Capacity", type: "integer", editable: true, nullable: false },
  { name: "GlobalID", alias: "GlobalID", type: "global-id", editable: true, nullable: false },
  { name: "created_date", alias: "Created date", type: "date", editable: true, nullable: true }
];
const layer = {
  fields, objectIdField: "OBJECTID", geometryType: "point",
  capabilities: { operations: { supportsAdd: true, supportsUpdate: true, supportsDelete: true } }
};
const point = { type: "point", x: 1, y: 2, spatialReference: { wkid: 4326 } };

test("facility bindings are conservative and system fields stay excluded", () => {
  const bindings = inferFacilityBindings(fields, "OBJECTID");
  assert.equal(bindings.name, "FACILITY_NAME");
  assert.equal(bindings.type, "FAC_TYPE");
  assert.equal(bindings.status, "STATUS");
  assert.deepEqual(additionalFacilityFields(fields, bindings, "OBJECTID").map((field) => field.name), ["CAPACITY"]);
});

test("facility create/update/delete gates are explicit", () => {
  const bindings = inferFacilityBindings(fields, "OBJECTID");
  assert.equal(facilityEditGate({ action: "add", signedIn: false, layer, bindings, geometry: point }).allowed, false);
  assert.equal(facilityEditGate({ action: "add", signedIn: true, layer, bindings, geometry: point }).allowed, true);
  assert.equal(facilityEditGate({ action: "update", signedIn: true, layer, record: { objectId: null }, bindings, geometry: point }).allowed, false);
  assert.equal(facilityEditGate({ action: "delete", signedIn: true, layer, record: { objectId: 7, sourceType: "service" } }).allowed, true);
  assert.equal(facilityEditGate({ action: "delete", signedIn: true, layer, record: { objectId: 7, sourceType: "demo" } }).allowed, false);
});

test("payload construction preserves update attrs and validates create requirements/domains", () => {
  const bindings = inferFacilityBindings(fields, "OBJECTID");
  const update = buildFacilityFeature({ mode: "update", record: { objectId: 7, attributes: { OBJECTID: 7, UNTOUCHED: "yes", CAPACITY: 4 } }, values: { name: "Central", type: "EOC", status: "Open" }, additionalValues: { CAPACITY: "12" }, layer, bindings, geometry: point });
  assert.deepEqual(update.errors, []);
  assert.equal(update.feature.attributes.UNTOUCHED, "yes");
  assert.equal(update.feature.attributes.OBJECTID, 7);
  assert.equal(update.feature.attributes.CAPACITY, 12);
  const invalid = buildFacilityFeature({ mode: "add", values: { name: "", type: "bad", status: "Open" }, additionalValues: { CAPACITY: "" }, layer, bindings, geometry: point });
  assert.match(invalid.errors.join(" "), /Facility name is required/);
  assert.match(invalid.errors.join(" "), /allowed value/);
  assert.match(invalid.errors.join(" "), /Capacity is required/);
});

test("geometry compatibility never fabricates non-point shapes", () => {
  assert.equal(geometryCompatibility(layer, point).compatible, true);
  assert.equal(geometryCompatibility({ ...layer, geometryType: "polygon" }, point).compatible, false);
  assert.equal(geometryCompatibility({ ...layer, geometryType: "polygon" }, point).pointPlacement, false);
});

test("delete warning reports references and promises no asset mutation", () => {
  const facility = { name: "Central" };
  const resources = [{ facility: "Central" }, { locationName: " central " }, { facility: "Other" }];
  assert.equal(countFacilityReferences(facility, resources), 2);
  const warning = deleteWarningModel(facility, resources);
  assert.match(warning.message, /permanent/);
  assert.match(warning.message, /2 assets/);
  assert.match(warning.message, /not removed or reassigned automatically/);
});

test("mock locator results require a confident preview", () => {
  const mockResults = [{ score: 72, location: point }, { score: 91, location: { ...point, x: 3 } }];
  assert.equal(selectConfidentAddressMatch(mockResults).score, 91);
  assert.throws(() => selectConfidentAddressMatch([{ score: 79, location: point }]), /79\/100/);
  assert.throws(() => selectConfidentAddressMatch([]), /No address match/);
});

test("map picker lifecycle is one shot and cancel-safe", () => {
  const picker = createMapPickerLifecycle();
  picker.start(); assert.equal(picker.active, true);
  assert.equal(picker.complete(), true); assert.equal(picker.active, false);
  assert.equal(picker.complete(), false);
  picker.start(); picker.cancel(); assert.equal(picker.active, false);
});

test("facility runtime has three SDK applyEdits shapes, confirmation, mocks, and no fetch", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const map = await readFile(new URL("../src/map.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(app, /applyEdits\(\{ addFeatures: \[payload\.feature\] \}\)/);
  assert.match(app, /applyEdits\(\{ updateFeatures: \[payload\.feature\] \}\)/);
  assert.match(app, /applyEdits\(\{ deleteFeatures: \[\{ attributes: \{ \[state\.facilityLayer\.objectIdField\]: record\.objectId \} \}\] \}\)/);
  assert.match(html, /id="removeFacilityDialog"/);
  assert.match(html, /Confirm removal/);
  assert.match(app, /startPointSelection/);
  assert.match(app, /addressToLocations/);
  assert.match(app, /id="locateFacilityDevice"/);
  assert.match(app, /id="addNewFacilityButton"/);
  assert.match(map, /popupTemplate = servicePopupTemplate/);
  assert.match(map, /buttonEnabled: true/);
  assert.match(map, /mapElement\.itemId = config\.webMapItemId/);
  assert.match(map, /await mapElement\.viewOnReady\(\)/);
  for (const component of ["arcgis-map", "arcgis-zoom", "arcgis-home", "arcgis-basemap-gallery", "arcgis-layer-list", "arcgis-legend", "arcgis-bookmarks"]) assert.match(html, new RegExp(`<${component}`));
  assert.match(map, /await view\.goTo\(\{ target: record\.geometry/);
  assert.match(map, /await view\.openPopup\(\{ features: \[feature\]/);
  assert.match(map, /objectIds: \[record\.objectId\]/);
  assert.doesNotMatch(map, /map-control-button|@arcgis\/core\/widgets\//);
  assert.doesNotMatch(app, /\bfetch\s*\(/);
  assert.doesNotMatch(map, /\bfetch\s*\(/);
});
