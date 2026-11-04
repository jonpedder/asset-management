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
  const quantity = parseRange(row["Est. Qty"]);
  const unitCost = parseRange(row["Est. Unit Cost"], { currency: true });
  return {
    id: `import-${index + 1}`,
    assetType: cleanText(row["Asset Type"]),
    department: cleanText(row.Dept),
    category: cleanText(row.Category),
    quantity,
    availability: cleanText(row.Availability),
    eocRole: cleanText(row["EOC Role / Use"]),
    operator: normalizeOperator(row["Operator Required?"]),
    status: normalizeStatus(row.Status || row.Availability),
    gapDescription: cleanText(row["Gap Description"]),
    priority: normalizePriority(row["Procurement Priority"]),
    unitCost,
    notes: cleanText(row["Notes / Source"]),
    source: "Imported CSV (browser-local preview)",
    sourceType: "import",
    isMockLocation: false,
    locationMethod: "Pending validation",
    geometry: null,
    raw: row
  };
}
