import { cleanText, normalizeKey } from "./normalize.js";

export const FACILITY_FIELDS = [
  { key: "name", label: "Facility name", required: true, aliases: ["facility name", "site name", "location name", "name", "title"] },
  { key: "type", label: "Type", aliases: ["facility type", "site type", "type", "category"] },
  { key: "status", label: "Status", aliases: ["facility status", "operational status", "status", "condition"] },
  { key: "department", label: "Department", aliases: ["department", "dept", "agency", "division", "owner"] },
  { key: "address", label: "Address", aliases: ["street address", "address 1", "address", "street"] },
  { key: "city", label: "City", aliases: ["city", "municipality", "town"] },
  { key: "state", label: "State", aliases: ["state", "province", "region"] },
  { key: "zip", label: "ZIP", aliases: ["zip code", "postal code", "postcode", "zip"] },
  { key: "notes", label: "Notes", aliases: ["facility notes", "notes", "comments", "description"] }
];

function scoreField(field, aliases) {
  const candidates = [field?.name, field?.alias].map(normalizeKey).filter(Boolean);
  let score = 0;
  aliases.forEach((alias, index) => {
    const hint = normalizeKey(alias);
    for (const candidate of candidates) {
      if (candidate === hint) score = Math.max(score, 100 - index);
      else if (hint.length > 3 && (candidate.startsWith(`${hint} `) || candidate.endsWith(` ${hint}`))) score = Math.max(score, 55 - index);
    }
  });
  return score;
}

export function isEditableFacilityField(field, objectIdField = "") {
  if (!field || field.editable === false || field.name === objectIdField) return false;
  const type = String(field.type || "").toLowerCase();
  const name = normalizeKey(field.name);
  if (["oid", "global-id", "globalid", "guid", "geometry", "blob", "raster", "xml"].some((part) => type.includes(part))) return false;
  return !/(object ?id|global ?id|shape length|shape area|created user|created date|last edited user|last edited date)/.test(name);
}

export function inferFacilityBindings(fields = [], objectIdField = "") {
  const bindings = {};
  for (const definition of FACILITY_FIELDS) {
    const ranked = fields
      .filter((field) => isEditableFacilityField(field, objectIdField))
      .map((field) => ({ field, score: scoreField(field, definition.aliases) }))
      .filter(({ score }) => score >= 55)
      .sort((a, b) => b.score - a.score);
    if (ranked.length && (!ranked[1] || ranked[0].score > ranked[1].score)) bindings[definition.key] = ranked[0].field.name;
  }
  return bindings;
}

export function additionalFacilityFields(fields = [], bindings = {}, objectIdField = "") {
  const bound = new Set(Object.values(bindings));
  return fields.filter((field) => isEditableFacilityField(field, objectIdField) && !bound.has(field.name));
}

export function geometryCompatibility(layer, geometry) {
  const layerType = String(layer?.geometryType || "").toLowerCase().replace("esrigeometry", "");
  if (!layerType) return { compatible: false, pointPlacement: false, reason: "The facility layer does not report a geometry type." };
  const pointLayer = layerType === "point";
  if (!geometry) return { compatible: false, pointPlacement: pointLayer, reason: "A usable facility geometry is required." };
  const geometryType = String(geometry.type || (Number.isFinite(geometry.x) && Number.isFinite(geometry.y) ? "point" : "")).toLowerCase();
  if (geometryType !== layerType) return { compatible: false, pointPlacement: pointLayer, reason: `The ${layerType} facility layer cannot store ${geometryType || "unknown"} geometry.` };
  return { compatible: true, pointPlacement: pointLayer, reason: "Geometry is compatible with the facility layer." };
}

function operationSupport(layer, action) {
  const operations = layer?.capabilities?.operations || {};
  return action === "add" ? operations.supportsAdd : action === "update" ? operations.supportsUpdate : operations.supportsDelete;
}

export function facilityEditGate({ action, signedIn, layer, record, bindings = inferFacilityBindings(layer?.fields, layer?.objectIdField), geometry = record?.geometry }) {
  const verb = action === "add" ? "add" : action === "update" ? "update" : "remove";
  if (record?.sourceType === "demo") return { allowed: false, reason: "Invented demo facilities can be reviewed but never persisted." };
  if (!signedIn) return { allowed: false, reason: `Sign in to ${verb} a facility.` };
  if (!layer) return { allowed: false, reason: "The facility layer is not loaded." };
  if (!operationSupport(layer, action)) return { allowed: false, reason: `The facility layer does not report ${verb} support.` };
  if ((action === "update" || action === "delete") && (!layer.objectIdField || record?.objectId == null || record.objectId === "" || !Number.isFinite(Number(record.objectId)))) return { allowed: false, reason: "This facility has no valid object ID." };
  if (action !== "delete" && !bindings.name) return { allowed: false, reason: "No editable service field can safely store Facility name." };
  if (action !== "delete" && !additionalFacilityFields(layer.fields || [], {}, layer.objectIdField).length) return { allowed: false, reason: "The facility layer has no editable attribute fields." };
  if (action !== "delete" && !geometryCompatibility(layer, geometry).compatible) return { allowed: false, reason: geometryCompatibility(layer, geometry).reason };
  return { allowed: true, reason: `${verb[0].toUpperCase()}${verb.slice(1)} is available only through the explicit ${action === "delete" ? "confirmation" : "Save facility"} action.` };
}

function validateRange(value, field) {
  const range = field?.domain?.range;
  if (Array.isArray(range) && (value < range[0] || value > range[1])) return { error: `${field.alias || field.name} must be between ${range[0]} and ${range[1]}.` };
  return { value };
}

export function coerceFacilityValue(raw, field) {
  const value = typeof raw === "string" ? raw.trim() : raw;
  if (value == null || value === "") return field?.nullable === false ? { error: `${field.alias || field.name} is required.` } : { value: null };
  const coded = field?.domain?.codedValues;
  if (Array.isArray(coded)) {
    const match = coded.find((entry) => String(entry.code) === String(value));
    return match ? { value: match.code } : { error: `${field.alias || field.name} must use an allowed value.` };
  }
  const type = String(field?.type || "").toLowerCase();
  if (type.includes("integer")) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? validateRange(number, field) : { error: `${field.alias || field.name} must be a whole number.` };
  }
  if (["double", "single", "float"].some((part) => type.includes(part))) {
    const number = Number(value);
    return Number.isFinite(number) ? validateRange(number, field) : { error: `${field.alias || field.name} must be a number.` };
  }
  if (type.includes("date")) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? { value: time } : { error: `${field.alias || field.name} must be a valid date.` };
  }
  const text = String(value);
  return field?.length && text.length > field.length ? { error: `${field.alias || field.name} is limited to ${field.length} characters.` } : { value: text };
}

export function facilityValuesFromRecord(record = {}, bindings = {}) {
  const attributes = record.attributes || {};
  return Object.fromEntries(FACILITY_FIELDS.map(({ key }) => [key, cleanText(record[key] ?? (bindings[key] ? attributes[bindings[key]] : ""))]));
}

export function buildFacilityFeature({ mode, record = {}, values, additionalValues = {}, layer, bindings, geometry }) {
  const fields = new Map((layer?.fields || []).map((field) => [field.name, field]));
  const attributes = mode === "update" ? { ...(record.attributes || {}) } : {};
  const errors = [];
  if (!bindings?.name) errors.push("No editable service field can safely store Facility name.");
  if (!String(values?.name || "").trim()) errors.push("Facility name is required.");
  for (const definition of FACILITY_FIELDS) {
    const fieldName = bindings?.[definition.key];
    if (!fieldName || !(definition.key in (values || {}))) continue;
    const field = fields.get(fieldName);
    if (!isEditableFacilityField(field, layer?.objectIdField)) continue;
    const result = coerceFacilityValue(values[definition.key], field);
    if (result.error) errors.push(result.error); else attributes[fieldName] = result.value;
  }
  for (const [fieldName, raw] of Object.entries(additionalValues)) {
    const field = fields.get(fieldName);
    if (!isEditableFacilityField(field, layer?.objectIdField)) continue;
    const result = coerceFacilityValue(raw, field);
    if (result.error) errors.push(result.error); else attributes[fieldName] = result.value;
  }
  if (mode === "add") {
    for (const field of layer?.fields || []) {
      if (!isEditableFacilityField(field, layer.objectIdField) || field.nullable !== false || field.defaultValue != null || attributes[field.name] != null) continue;
      errors.push(`${field.alias || field.name} is required.`);
    }
  } else if (layer?.objectIdField && record?.objectId != null) attributes[layer.objectIdField] = record.objectId;
  const compatibility = geometryCompatibility(layer, geometry);
  if (!compatibility.compatible) errors.push(compatibility.reason);
  return errors.length ? { errors: [...new Set(errors)] } : { errors: [], feature: { attributes, geometry } };
}

export function countFacilityReferences(facility, resources = []) {
  const target = normalizeKey(facility?.name);
  if (!target) return 0;
  return resources.filter((resource) => [resource.facility, resource.locationName].some((value) => normalizeKey(value) === target)).length;
}

export function deleteWarningModel(facility, resources = []) {
  const referenceCount = countFacilityReferences(facility, resources);
  return {
    name: cleanText(facility?.name) || "this facility",
    referenceCount,
    message: `Removing ${cleanText(facility?.name) || "this facility"} is permanent. ${referenceCount} asset${referenceCount === 1 ? "" : "s"} currently reference or are located at this facility. Assets are not removed or reassigned automatically.`
  };
}

export function selectConfidentAddressMatch(results = [], minimumScore = 80) {
  const best = [...results].sort((a, b) => (b?.score || 0) - (a?.score || 0))[0];
  if (!best?.location) throw new Error("No address match was found. Geometry was not changed.");
  if (Number(best.score || 0) < minimumScore) throw new Error(`Best address match confidence was ${best.score || 0}/100. Refine the address; geometry was not changed.`);
  return best;
}

export function createMapPickerLifecycle() {
  let active = false;
  return { start() { active = true; }, cancel() { active = false; }, complete() { if (!active) return false; active = false; return true; }, get active() { return active; } };
}
