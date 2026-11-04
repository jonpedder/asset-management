import { cleanText, normalizeStatus } from "./normalize.js";

function valueByHints(attributes, hints) {
  const entries = Object.entries(attributes ?? {});
  for (const hint of hints) {
    const match = entries.find(([key]) => hint.test(key));
    if (match && match[1] != null && String(match[1]).trim()) return match[1];
  }
  return "";
}

export function resourceFromFeature(feature, index = 0) {
  const attributes = feature.attributes ?? {};
  const assetType = cleanText(valueByHints(attributes, [/asset.*type/i, /resource.*type/i, /^type$/i, /name/i])) || `Resource ${index + 1}`;
  const quantityRaw = valueByHints(attributes, [/quantity/i, /qty/i, /count/i]);
  const quantityNumber = Number(quantityRaw);
  return {
    id: `service-resource-${attributes.OBJECTID ?? attributes.objectid ?? index + 1}`,
    assetType,
    department: cleanText(valueByHints(attributes, [/department/i, /dept/i, /agency/i, /owner/i])),
    category: cleanText(valueByHints(attributes, [/category/i, /kind/i, /class/i])),
    quantity: { raw: String(quantityRaw || "1"), min: Number.isFinite(quantityNumber) ? quantityNumber : 1, max: Number.isFinite(quantityNumber) ? quantityNumber : 1, estimate: Number.isFinite(quantityNumber) ? quantityNumber : 1 },
    status: normalizeStatus(valueByHints(attributes, [/status/i, /availability/i, /condition/i])),
    priority: "Unspecified",
    operator: "Unknown",
    geometry: feature.geometry,
    source: "Current feature service",
    sourceType: "service",
    locationMethod: "Verified service geometry",
    isMockLocation: false,
    attributes
  };
}

export function facilityFromFeature(feature, index = 0) {
  const attributes = feature.attributes ?? {};
  return {
    id: `service-facility-${attributes.OBJECTID ?? attributes.objectid ?? index + 1}`,
    name: cleanText(valueByHints(attributes, [/facility.*name/i, /site.*name/i, /^name$/i, /title/i])) || `Facility ${index + 1}`,
    type: cleanText(valueByHints(attributes, [/facility.*type/i, /^type$/i, /category/i])) || "Facility",
    status: cleanText(valueByHints(attributes, [/status/i, /condition/i])) || "Unknown",
    department: cleanText(valueByHints(attributes, [/department/i, /dept/i, /agency/i, /owner/i])),
    geometry: feature.geometry,
    source: "Current feature service",
    sourceType: "service",
    attributes
  };
}

export async function queryAllFeatures(layer, batchSize = 500) {
  const objectIds = await layer.queryObjectIds({ where: "1=1" });
  if (!objectIds?.length) return [];
  const features = [];
  for (let index = 0; index < objectIds.length; index += batchSize) {
    const result = await layer.queryFeatures({
      objectIds: objectIds.slice(index, index + batchSize),
      outFields: ["*"],
      returnGeometry: true,
      outSpatialReference: { wkid: 4326 }
    });
    features.push(...result.features);
  }
  return features;
}
