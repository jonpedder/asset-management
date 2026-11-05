const STATUS_RULES = [
  [/(gap|need more|unavailable|out of service|offline|none|not available)/, "Gap — Need More"],
  [/(limited|partial|degraded|maintenance|conditional)/, "Partial"],
  [/(have|available|ready|operational|in service|active)/, "Have"]
];
const PRIORITY_RULES = [
  [/(critical|urgent|immediate|p\s*1)/, "P1 — Critical"],
  [/(high|p\s*2)/, "P2 — High"],
  [/(medium|moderate|p\s*3)/, "Medium"],
  [/(low|routine|p\s*4)/, "Low"]
];

export function cleanText(value) {
  return String(value ?? "")
    .replace(/\uFFFD/g, "-")
    .replace(/â€“|â€”|âˆ’/g, "-")
    .replace(/â€™|â€˜/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/\s+\?\s+/g, " - ")
    .replace(/\s*[–—]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeKey(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function numbersFrom(value) {
  return cleanText(value)
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite) ?? [];
}

export function parseRange(value, { currency = false } = {}) {
  const raw = cleanText(value);
  const numbers = numbersFrom(raw).map((number) => Math.max(0, number));
  if (!numbers.length) return { raw, min: null, max: null, estimate: null, currency };
  const min = numbers[0];
  const max = numbers.length > 1 ? numbers[1] : min;
  return {
    raw,
    min: Math.min(min, max),
    max: Math.max(min, max),
    estimate: numbers.length > 1 ? (min + max) / 2 : min,
    currency
  };
}

function applyRules(value, rules, fallback) {
  const key = normalizeKey(value);
  return rules.find(([pattern]) => pattern.test(key))?.[1] ?? fallback;
}

export function normalizeStatus(value) {
  return applyRules(value, STATUS_RULES, "Unknown");
}

export function normalizePriority(value) {
  return applyRules(value, PRIORITY_RULES, "Unspecified");
}

export function normalizeOperator(value) {
  const key = normalizeKey(value);
  if (/(cdl)/.test(key)) return "CDL required";
  if (/(licensed|license only)/.test(key)) return "Licensed operator required";
  if (/(certified)/.test(key)) return "Certified operator required";
  if (/^(yes|y|required|true|1)$/.test(key) || /operator required/.test(key)) return "Required";
  if (/^(no|n|not required|false|0)$/.test(key)) return "Not required";
  if (/(conditional|sometimes|preferred|as needed)/.test(key)) return "Conditional";
  return "Unknown";
}

export function normalizeImportedRecord(row, index = 0) {
  // Accept both the legacy documented headings and the Settings mapper's schema keys.
  const value = (key, legacy) => row[key] ?? row[legacy] ?? "";
  const quantity = parseRange(value("quantity", "Est. Qty"));
  const unitCost = parseRange(value("unitCost", "Est. Unit Cost"), { currency: true });
  const availability = value("availability", "Availability");
  return {
    id: `import-${index + 1}`,
    assetType: cleanText(value("assetType", "Asset Type")),
    department: cleanText(value("department", "Dept")),
    category: cleanText(value("category", "Category")),
    quantity,
    availability: cleanText(availability),
    eocRole: cleanText(value("eocRole", "EOC Role / Use")),
    operator: normalizeOperator(value("operator", "Operator Required?")),
    status: normalizeStatus(value("status", "Status") || availability),
    gapDescription: cleanText(value("gapDescription", "Gap Description")),
    priority: normalizePriority(value("priority", "Procurement Priority")),
    unitCost,
    notes: cleanText(value("notes", "Notes / Source")),
    locationName: cleanText(value("locationName", "Location name")),
    address: cleanText(value("address", "Address")),
    city: cleanText(value("city", "City")),
    state: cleanText(value("state", "State")),
    zip: cleanText(value("zip", "ZIP")),
    facility: cleanText(value("facility", "Facility")),
    source: "Imported CSV (browser-local preview)",
    sourceType: "import",
    isMockLocation: false,
    locationMethod: "Pending validation",
    geometry: null,
    raw: row
  };
}
