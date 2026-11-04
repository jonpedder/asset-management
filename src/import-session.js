export const IMPORT_SESSION_KEY = "asset-management.import-session.v1";
export const IMPORT_SESSION_VERSION = 1;
export const MAX_IMPORT_RECORDS = 5000;
export const MAX_IMPORT_SESSION_BYTES = 4_000_000;
const MAX_TEXT_LENGTH = 4000;
const RECORD_KEYS = [
  "id", "assetType", "department", "category", "quantity", "availability",
  "eocRole", "operator", "status", "gapDescription", "priority", "unitCost",
  "notes", "source", "sourceType", "isMockLocation", "locationMethod", "geometry"
];
const SESSION_KEYS = ["version", "records", "ignoredRows", "headerRow", "savedAt"];
const RANGE_KEYS = ["raw", "min", "max", "estimate", "currency"];

function storageOrDefault(storage) {
  if (storage) return storage;
  if (typeof sessionStorage === "undefined") throw new Error("Session storage is not available in this browser.");
  return sessionStorage;
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function text(value, field, { required = false } = {}) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new Error(`Imported record ${field} is required.`);
  if (result.length > MAX_TEXT_LENGTH) throw new Error(`Imported record ${field} exceeds ${MAX_TEXT_LENGTH} characters.`);
  return result;
}

function finiteOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("Imported numeric ranges must contain non-negative finite values.");
  return number;
}

function range(value, currency = false) {
  const result = {
    raw: text(value?.raw, "range"),
    min: finiteOrNull(value?.min),
    max: finiteOrNull(value?.max),
    estimate: finiteOrNull(value?.estimate),
    currency: Boolean(currency)
  };
  if (result.min != null && result.max != null && result.min > result.max) throw new Error("Imported range minimum cannot exceed its maximum.");
  return result;
}

function serializeRecord(record, index) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Every imported record must be an object.");
  return {
    id: `import-${index + 1}`,
    assetType: text(record.assetType, "assetType", { required: true }),
    department: text(record.department, "department"),
    category: text(record.category, "category"),
    quantity: range(record.quantity),
    availability: text(record.availability, "availability"),
    eocRole: text(record.eocRole, "eocRole"),
    operator: text(record.operator, "operator"),
    status: text(record.status, "status"),
    gapDescription: text(record.gapDescription, "gapDescription"),
    priority: text(record.priority, "priority"),
    unitCost: range(record.unitCost, true),
    notes: text(record.notes, "notes"),
    source: "Imported CSV (browser-local preview)",
    sourceType: "import",
    isMockLocation: false,
    locationMethod: "Pending validation",
    geometry: null
  };
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}

function validateStoredRecord(record, index) {
  if (!exactKeys(record, RECORD_KEYS) || !exactKeys(record.quantity, RANGE_KEYS) || !exactKeys(record.unitCost, RANGE_KEYS)) {
    throw new Error("Stored import record shape is invalid.");
  }
  const normalized = serializeRecord(record, index);
  const scalarKeys = RECORD_KEYS.filter((key) => !["quantity", "unitCost"].includes(key));
  const scalarMatches = scalarKeys.every((key) => record[key] === normalized[key]);
  const rangesMatch = RANGE_KEYS.every((key) => record.quantity[key] === normalized.quantity[key]
    && record.unitCost[key] === normalized.unitCost[key]);
  if (!scalarMatches || !rangesMatch) throw new Error("Stored import record contains unsupported values.");
  return normalized;
}

function nonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Stored import ${field} is invalid.`);
  return value;
}

export function saveImportSession(records, metadata = {}, storage) {
  if (!Array.isArray(records)) throw new Error("Imported records must be an array.");
  if (!records.length) throw new Error("The CSV did not contain any inventory rows.");
  if (records.length > MAX_IMPORT_RECORDS) throw new Error(`CSV contains more than the ${MAX_IMPORT_RECORDS}-record session limit.`);
  const payload = {
    version: IMPORT_SESSION_VERSION,
    records: records.map(serializeRecord),
    ignoredRows: nonNegativeInteger(metadata.ignoredRows ?? 0, "ignored row count"),
    headerRow: nonNegativeInteger(metadata.headerRow ?? 0, "header row"),
    savedAt: new Date().toISOString()
  };
  const serialized = JSON.stringify(payload);
  if (byteLength(serialized) > MAX_IMPORT_SESSION_BYTES) throw new Error("Normalized import exceeds the 4 MB browser-session limit.");
  storageOrDefault(storage).setItem(IMPORT_SESSION_KEY, serialized);
  return payload;
}

export function readImportSession(storage) {
  const store = storageOrDefault(storage);
  const serialized = store.getItem(IMPORT_SESSION_KEY);
  if (!serialized) return null;
  if (byteLength(serialized) > MAX_IMPORT_SESSION_BYTES) {
    store.removeItem(IMPORT_SESSION_KEY);
    return null;
  }
  try {
    const payload = JSON.parse(serialized);
    if (!exactKeys(payload, SESSION_KEYS) || payload.version !== IMPORT_SESSION_VERSION || !Array.isArray(payload.records)
        || !payload.records.length || payload.records.length > MAX_IMPORT_RECORDS || !Number.isFinite(Date.parse(payload.savedAt))) {
      throw new Error("Stored import session shape is invalid.");
    }
    return {
      version: IMPORT_SESSION_VERSION,
      records: payload.records.map(validateStoredRecord),
      ignoredRows: nonNegativeInteger(payload.ignoredRows, "ignored row count"),
      headerRow: nonNegativeInteger(payload.headerRow, "header row"),
      savedAt: payload.savedAt
    };
  } catch {
    store.removeItem(IMPORT_SESSION_KEY);
    return null;
  }
}

export function clearImportSession(storage) {
  storageOrDefault(storage).removeItem(IMPORT_SESSION_KEY);
}
