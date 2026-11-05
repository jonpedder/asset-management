import { cleanText, normalizeStatus, parseRange } from "./normalize.js";
import { inferFieldBindings } from "./asset-editing.js";

function bound(attributes, bindings, key) { const name = bindings?.[key]; return name ? attributes?.[name] ?? "" : ""; }
function objectIdFrom(feature, objectIdField, index, allowDisplayFallback = true) {
  const attributes = feature.attributes || {};
  const objectId = attributes[objectIdField] ?? attributes.OBJECTID ?? attributes.objectid;
  return objectId ?? (allowDisplayFallback ? index + 1 : null);
}

export function resourceFromFeature(feature, index = 0, fields = [], objectIdField = "OBJECTID") {
  const attributes = feature.attributes ?? {};
  const bindings = inferFieldBindings(fields.length ? fields : Object.keys(attributes).map((name) => ({ name, alias: name, type: "string" })));
  const objectId = objectIdFrom(feature, objectIdField, index, false);
  const quantity = parseRange(bound(attributes, bindings, "quantityRaw") || "1");
  const unitCost = parseRange(bound(attributes, bindings, "unitCostRaw"), { currency: true });
  const availability = cleanText(bound(attributes, bindings, "availability"));
  return {
    id: objectId == null ? `service-resource-row-${index + 1}` : `service-resource-${objectId}`, objectId,
    assetType: cleanText(bound(attributes, bindings, "assetType")) || `Resource ${index + 1}`,
    department: cleanText(bound(attributes, bindings, "department")), category: cleanText(bound(attributes, bindings, "category")), quantity,
    availability, eocRole: cleanText(bound(attributes, bindings, "eocRole")), operator: cleanText(bound(attributes, bindings, "operator")) || "Unknown",
    status: cleanText(bound(attributes, bindings, "status")) || normalizeStatus(availability), gapDescription: cleanText(bound(attributes, bindings, "gapDescription")),
    priority: cleanText(bound(attributes, bindings, "priority")) || "Unspecified", unitCost, notes: cleanText(bound(attributes, bindings, "notes")),
    locationName: cleanText(bound(attributes, bindings, "locationName")), address: cleanText(bound(attributes, bindings, "address")),
    city: cleanText(bound(attributes, bindings, "city")), state: cleanText(bound(attributes, bindings, "state")), zip: cleanText(bound(attributes, bindings, "zip")),
    geometry: feature.geometry, source: "Current feature service", sourceType: "service", locationMethod: "Verified service geometry", isMockLocation: false,
    attributes, fieldBindings: bindings
  };
}

function valueByHints(attributes, hints) {
  const entries = Object.entries(attributes ?? {});
  for (const hint of hints) { const match = entries.find(([key]) => hint.test(key)); if (match && match[1] != null && String(match[1]).trim()) return match[1]; }
  return "";
}
export function facilityFromFeature(feature, index = 0, objectIdField = "OBJECTID", fields = []) {
  const attributes = feature.attributes ?? {}; const objectId = objectIdFrom(feature, objectIdField, index);
  return {
    id: `service-facility-${objectId}`, objectId,
    name: cleanText(valueByHints(attributes, [/facility.*name/i, /site.*name/i, /^name$/i, /title/i])) || `Facility ${index + 1}`,
    type: cleanText(valueByHints(attributes, [/facility.*type/i, /^type$/i, /category/i])) || "Facility",
    status: cleanText(valueByHints(attributes, [/status/i, /condition/i])) || "Unknown",
    department: cleanText(valueByHints(attributes, [/department/i, /dept/i, /agency/i, /owner/i])),
    geometry: feature.geometry, source: "Current feature service", sourceType: "service", attributes,
    fieldAliases: Object.fromEntries(fields.map((field) => [field.name, field.alias || field.name]))
  };
}
export async function queryAllFeatures(layer, batchSize = 500) {
  const objectIds = await layer.queryObjectIds({ where: "1=1" }); if (!objectIds?.length) return [];
  const features = [];
  for (let index = 0; index < objectIds.length; index += batchSize) {
    const result = await layer.queryFeatures({ objectIds: objectIds.slice(index, index + batchSize), outFields: ["*"], returnGeometry: true, outSpatialReference: { wkid: 4326 } });
    features.push(...result.features);
  }
  return features;
}
