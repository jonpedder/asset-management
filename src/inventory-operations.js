import { buildServiceUpdate, extractFacilityAddress, inferFieldBindings, isEditableServiceField } from "./asset-editing.js";

const LOCATION_KEYS = ["locationName", "address", "city", "state", "zip"];

export function normalizeFilterValue(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function filterResourceRecords(records = [], filters = {}) {
  const search = normalizeFilterValue(filters.search);
  const facility = normalizeFilterValue(filters.facility);
  const city = normalizeFilterValue(filters.city);
  const zip = normalizeFilterValue(filters.zip);
  return records.filter((record) => {
    const haystack = normalizeFilterValue([record.assetType, record.department, record.category, record.status, record.source].join(" "));
    const recordFacility = normalizeFilterValue(record.facility || record.locationName);
    const recordCity = normalizeFilterValue(record.city);
    const recordZip = normalizeFilterValue(record.zip);
    return (!search || haystack.includes(search))
      && (!filters.source || record.sourceType === filters.source)
      && (!facility || recordFacility === facility)
      && (!city || recordCity.includes(city))
      && (!zip || recordZip.includes(zip));
  });
}

export function facilityFilterOptions(facilities = [], records = []) {
  const options = new Map();
  for (const facility of facilities) {
    const label = String(facility?.name ?? "").trim();
    if (label) options.set(normalizeFilterValue(label), label);
  }
  for (const record of records) {
    const label = String(record?.facility || record?.locationName || "").trim();
    if (label && !options.has(normalizeFilterValue(label))) options.set(normalizeFilterValue(label), label);
  }
  return [...options.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

export function cleanSelectedIds(selectedIds, records = []) {
  const available = new Set(records.map((record) => record.id));
  return new Set([...selectedIds].filter((id) => available.has(id)));
}

export function facilityAssignment(facility) {
  const address = extractFacilityAddress(facility);
  return {
    locationName: address.name, facility: address.name, address: address.address, city: address.city,
    state: address.state, zip: address.zip, geometry: address.geometry, locationMethod: "Existing facility assigned in bulk", isMockLocation: false
  };
}

export function planBulkFacilityAssignment({ selectedRecords = [], facility, signedIn = false, layer = null }) {
  if (!selectedRecords.length) throw new Error("Select at least one asset.");
  if (!facility) throw new Error("Choose a loaded facility.");
  const demos = selectedRecords.filter((record) => record.sourceType === "demo");
  const unsupported = selectedRecords.filter((record) => !["service", "import", "demo"].includes(record.sourceType));
  if (demos.length) throw new Error(`Remove ${demos.length} invented demo asset${demos.length === 1 ? "" : "s"} from the selection; demo records are never persisted.`);
  if (unsupported.length) throw new Error(`Remove ${unsupported.length} asset${unsupported.length === 1 ? "" : "s"} with an unsupported source.`);
  const assignment = facilityAssignment(facility);
  const imported = selectedRecords.filter((record) => record.sourceType === "import");
  const service = selectedRecords.filter((record) => record.sourceType === "service");
  if (service.length) {
    if (!signedIn) throw new Error("Sign in before assigning a facility to service assets.");
    if (!layer) throw new Error("The resource layer is not loaded.");
    if (!layer.capabilities?.operations?.supportsUpdate) throw new Error("The resource layer does not report update support.");
    if (!layer.objectIdField || service.some((record) => record.objectId == null || record.objectId === "")) throw new Error("Every selected service asset must have a real object ID.");
    if (!assignment.geometry || typeof assignment.geometry !== "object") throw new Error("The chosen facility has no usable geometry for service updates.");
    if (layer.geometryType && assignment.geometry.type && layer.geometryType !== assignment.geometry.type) throw new Error(`Facility geometry type ${assignment.geometry.type} is not compatible with the resource layer's ${layer.geometryType} geometry.`);
  }
  const bindings = inferFieldBindings(layer?.fields || []);
  const editableBindings = Object.fromEntries(LOCATION_KEYS.flatMap((key) => {
    const name = bindings[key];
    const field = layer?.fields?.find((candidate) => candidate.name === name);
    return name && isEditableServiceField(field, layer?.objectIdField) ? [[key, name]] : [];
  }));
  const values = Object.fromEntries(LOCATION_KEYS.map((key) => [key, assignment[key]]));
  const serviceFeatures = service.map((record) => {
    const update = buildServiceUpdate(record, values, layer, editableBindings, {}, assignment.geometry);
    if (update.errors.length) throw new Error(update.errors.join(" "));
    return update.feature;
  });
  return {
    assignment, importedIds: imported.map((record) => record.id), serviceRecords: service, serviceFeatures,
    editableLocationFields: Object.keys(editableBindings), geometryOnly: service.length > 0 && Object.keys(editableBindings).length === 0
  };
}

export function summarizeServiceUpdateResults(result, expectedRecords = []) {
  const results = result?.updateFeatureResults || [];
  const entries = expectedRecords.map((record, index) => ({ record, result: results[index] }));
  const succeeded = entries.filter(({ result: item }) => item && !item.error);
  const failed = entries.filter(({ result: item }) => !item || item.error);
  return {
    requested: expectedRecords.length, successCount: succeeded.length, failureCount: failed.length,
    successfulObjectIds: succeeded.map(({ record, result: item }) => item.objectId ?? record.objectId).filter((id) => id != null),
    failures: failed.map(({ record, result: item }) => ({ id: record.id, objectId: record.objectId, message: item?.error?.message || "No update result was returned." }))
  };
}
