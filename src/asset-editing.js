import { cleanText, normalizeKey, parseRange } from "./normalize.js";

export const NORMALIZED_FIELDS = [
  { key: "assetType", label: "Asset type", aliases: ["asset type", "asset", "resource type", "equipment type", "name"] },
  { key: "department", label: "Department", aliases: ["department", "dept", "agency", "division", "owner"] },
  { key: "category", label: "Category", aliases: ["category", "asset category", "resource category", "class"] },
  { key: "quantityRaw", label: "Quantity (raw value)", aliases: ["quantity", "estimated quantity", "est qty", "qty", "count"] },
  { key: "availability", label: "Availability", aliases: ["availability", "available", "readiness"] },
  { key: "eocRole", label: "EOC role / use", aliases: ["eoc role use", "eoc role", "emergency role", "operational use"] },
  { key: "operator", label: "Operator required", aliases: ["operator required", "operator", "licensing requirement"] },
  { key: "status", label: "Status", aliases: ["status", "operational status", "condition"] },
  { key: "gapDescription", label: "Gap description", aliases: ["gap description", "gap", "need gap"] },
  { key: "priority", label: "Procurement priority", aliases: ["procurement priority", "purchase priority", "priority"] },
  { key: "unitCostRaw", label: "Estimated unit cost (raw value)", aliases: ["estimated unit cost", "est unit cost", "unit cost", "cost per unit"] },
  { key: "notes", label: "Notes / source", aliases: ["notes source", "notes", "source", "comments"] },
  { key: "locationName", label: "Location name", aliases: ["location name", "facility name", "site name", "location"] },
  { key: "address", label: "Address", aliases: ["address", "street address", "address 1", "street"] },
  { key: "city", label: "City", aliases: ["city", "municipality", "town"] },
  { key: "state", label: "State", aliases: ["state", "province", "region"] },
  { key: "zip", label: "ZIP", aliases: ["zip", "zip code", "postal code", "postcode"] },
  { key: "facility", label: "Facility", aliases: ["facility", "facility name", "site", "site name"] }
];

const LOCATION_ALIASES = {
  name: ["facility name", "site name", "location name", "name", "title"],
  address: ["street address", "address 1", "address", "street", "addr"],
  city: ["city", "municipality", "town"],
  state: ["state", "province", "region", "st"],
  zip: ["zip code", "postal code", "postcode", "zip"]
};

function aliasScore(field, aliases) {
  const names = [field?.name, field?.alias].map(normalizeKey).filter(Boolean);
  let score = 0;
  aliases.forEach((alias, index) => {
    const key = normalizeKey(alias);
    for (const name of names) {
      if (name === key) score = Math.max(score, 100 - index);
      else if (key.length > 3 && (name.startsWith(`${key} `) || name.endsWith(` ${key}`))) score = Math.max(score, 55 - index);
    }
  });
  return score;
}

function valueByAliases(attributes, aliases, fieldAliases = {}) {
  const fields = Object.keys(attributes || {}).map((name) => ({ name, alias: fieldAliases[name] || name }));
  const match = fields.map((field) => ({ field, score: aliasScore(field, aliases) })).sort((a, b) => b.score - a.score)[0];
  return match?.score ? attributes[match.field.name] : "";
}

export function extractFacilityAddress(facility) {
  const attributes = facility?.attributes || {};
  return {
    name: cleanText(facility?.name || valueByAliases(attributes, LOCATION_ALIASES.name, facility?.fieldAliases)),
    address: cleanText(valueByAliases(attributes, LOCATION_ALIASES.address, facility?.fieldAliases)),
    city: cleanText(valueByAliases(attributes, LOCATION_ALIASES.city, facility?.fieldAliases)),
    state: cleanText(valueByAliases(attributes, LOCATION_ALIASES.state, facility?.fieldAliases)),
    zip: cleanText(valueByAliases(attributes, LOCATION_ALIASES.zip, facility?.fieldAliases)),
    geometry: facility?.geometry || null
  };
}

export function matchFacility(value, facilities = []) {
  const target = normalizeKey(value);
  if (!target) return null;
  const ranked = facilities.map((facility) => {
    const address = extractFacilityAddress(facility);
    const name = normalizeKey(address.name);
    const score = name === target ? 100 : name.startsWith(target) || target.startsWith(name) ? 70 : 0;
    return { facility, score };
  }).filter(({ score }) => score).sort((a, b) => b.score - a.score);
  return ranked.length === 1 || ranked[0]?.score > ranked[1]?.score ? ranked[0]?.facility || null : null;
}

export function inferFieldBindings(fields = []) {
  const bindings = {};
  for (const definition of NORMALIZED_FIELDS.filter((field) => field.key !== "facility")) {
    const ranked = fields.map((field) => ({ field, score: aliasScore(field, definition.aliases) }))
      .filter(({ score }) => score >= 55)
      .sort((a, b) => b.score - a.score);
    if (ranked.length && (!ranked[1] || ranked[0].score > ranked[1].score)) bindings[definition.key] = ranked[0].field.name;
  }
  return bindings;
}

export function isEditableServiceField(field, objectIdField = "") {
  const type = String(field?.type || "").toLowerCase();
  const name = normalizeKey(field?.name);
  if (!field || field.editable === false || field.name === objectIdField) return false;
  if (["oid", "global-id", "guid", "geometry", "blob", "raster", "xml"].some((part) => type.includes(part))) return false;
  return !/(object ?id|global ?id|shape length|shape area|created user|created date|last edited user|last edited date)/.test(name);
}

export function additionalEditableFields(fields = [], bindings = {}, objectIdField = "") {
  const bound = new Set(Object.values(bindings));
  return fields.filter((field) => isEditableServiceField(field, objectIdField) && !bound.has(field.name));
}

export function coerceFieldValue(raw, field) {
  const value = typeof raw === "string" ? raw.trim() : raw;
  const nullable = field?.nullable !== false;
  if (value == null || value === "") {
    if (!nullable) return { error: `${field.alias || field.name} is required.` };
    return { value: null };
  }
  const codedValues = field?.domain?.codedValues;
  if (Array.isArray(codedValues)) {
    const match = codedValues.find((entry) => String(entry.code) === String(value));
    if (!match) return { error: `${field.alias || field.name} must use an allowed value.` };
    return { value: match.code };
  }
  const type = String(field?.type || "").toLowerCase();
  if (type.includes("integer") || type.includes("small-integer") || type.endsWith("oid")) {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) return { error: `${field.alias || field.name} must be a whole number.` };
    return validateRange(number, field);
  }
  if (["double", "single", "float"].some((part) => type.includes(part))) {
    const number = Number(value);
    if (!Number.isFinite(number)) return { error: `${field.alias || field.name} must be a number.` };
    return validateRange(number, field);
  }
  if (type.includes("date")) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return { error: `${field.alias || field.name} must be a valid date.` };
    return { value: time };
  }
  const text = String(value);
  if (field?.length && text.length > field.length) return { error: `${field.alias || field.name} is limited to ${field.length} characters.` };
  return { value: text };
}

function validateRange(value, field) {
  const range = field?.domain?.range;
  if (Array.isArray(range) && (value < range[0] || value > range[1])) return { error: `${field.alias || field.name} must be between ${range[0]} and ${range[1]}.` };
  return { value };
}

export function serviceEditGate({ signedIn, layer, record }) {
  if (!signedIn) return { allowed: false, reason: "Sign in to save changes to the resource layer." };
  if (!layer) return { allowed: false, reason: "The resource layer is not loaded." };
  if (!layer.capabilities?.operations?.supportsUpdate) return { allowed: false, reason: "The loaded resource layer does not report update support." };
  if (!layer.objectIdField || record?.objectId == null) return { allowed: false, reason: "This feature has no usable object ID." };
  return { allowed: true, reason: "Changes are sent only after Save changes is clicked." };
}

export function editorValuesFromRecord(record) {
  return {
    assetType: record.assetType || "", department: record.department || "", category: record.category || "",
    quantityRaw: record.quantity?.raw || "", availability: record.availability || "", eocRole: record.eocRole || "",
    operator: record.operator || "", status: record.status || "", gapDescription: record.gapDescription || "",
    priority: record.priority || "", unitCostRaw: record.unitCost?.raw || "", notes: record.notes || "",
    locationName: record.locationName || "", address: record.address || "", city: record.city || "", state: record.state || "", zip: record.zip || "",
    facility: record.facility || ""
  };
}

export function normalizedRecordPatch(values) {
  return {
    assetType: cleanText(values.assetType), department: cleanText(values.department), category: cleanText(values.category),
    quantity: parseRange(values.quantityRaw), availability: cleanText(values.availability), eocRole: cleanText(values.eocRole),
    operator: cleanText(values.operator), status: cleanText(values.status), gapDescription: cleanText(values.gapDescription),
    priority: cleanText(values.priority), unitCost: parseRange(values.unitCostRaw, { currency: true }), notes: cleanText(values.notes),
    locationName: cleanText(values.locationName), address: cleanText(values.address), city: cleanText(values.city), state: cleanText(values.state),
    zip: cleanText(values.zip), facility: cleanText(values.facility)
  };
}

export function buildServiceUpdate(record, values, layer, bindings, additionalValues = {}, geometry = record.geometry) {
  const attributes = { ...(record.attributes || {}) };
  const errors = [];
  const fields = new Map((layer.fields || []).map((field) => [field.name, field]));
  for (const definition of NORMALIZED_FIELDS.filter((field) => field.key !== "facility")) {
    const fieldName = bindings[definition.key];
    if (!fieldName || !fields.has(fieldName) || !(definition.key in values)) continue;
    const field = fields.get(fieldName);
    if (!isEditableServiceField(field, layer.objectIdField)) continue;
    const result = coerceFieldValue(values[definition.key], field);
    if (result.error) errors.push(result.error); else attributes[fieldName] = result.value;
  }
  for (const [fieldName, raw] of Object.entries(additionalValues)) {
    const field = fields.get(fieldName);
    if (!field || !isEditableServiceField(field, layer.objectIdField)) continue;
    const result = coerceFieldValue(raw, field);
    if (result.error) errors.push(result.error); else attributes[fieldName] = result.value;
  }
  attributes[layer.objectIdField] = record.objectId;
  if (errors.length) return { errors };
  return { errors: [], feature: { attributes, geometry } };
}
