const EXPECTED_HEADERS = [
  "Asset Type", "Dept", "Category", "Est. Qty", "Availability",
  "EOC Role / Use", "Operator Required?", "Status", "Gap Description",
  "Procurement Priority", "Est. Unit Cost", "Notes / Source"
];

export const TARGET_FIELDS = [
  { key: "assetType", label: "Asset Type", required: true, aliases: ["Asset Type", "Asset", "Asset Name", "Resource Type", "Equipment Type"] },
  { key: "department", label: "Department", required: false, aliases: ["Dept", "Department", "Agency", "Division"] },
  { key: "category", label: "Category", required: false, aliases: ["Category", "Asset Category", "Resource Category"] },
  { key: "quantity", label: "Quantity", required: false, aliases: ["Est. Qty", "Estimated Quantity", "Quantity", "Qty"] },
  { key: "availability", label: "Availability", required: false, aliases: ["Availability", "Available", "Readiness"] },
  { key: "eocRole", label: "EOC Role / Use", required: false, aliases: ["EOC Role / Use", "EOC Role", "Emergency Role", "Operational Use"] },
  { key: "operator", label: "Operator Required?", required: false, aliases: ["Operator Required?", "Operator Required", "Operator", "Licensing Requirement"] },
  { key: "status", label: "Status", required: false, aliases: ["Status", "Operational Status", "Condition"] },
  { key: "gapDescription", label: "Gap Description", required: false, aliases: ["Gap Description", "Gap", "Need / Gap"] },
  { key: "priority", label: "Procurement Priority", required: false, aliases: ["Procurement Priority", "Priority", "Purchase Priority"] },
  { key: "unitCost", label: "Est. Unit Cost", required: false, aliases: ["Est. Unit Cost", "Estimated Unit Cost", "Unit Cost", "Cost Per Unit"] },
  { key: "notes", label: "Notes / Source", required: false, aliases: ["Notes / Source", "Notes", "Source", "Comments"] }
];

export function canonicalHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseCsv(text) {
  const input = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += char;
      }
    } else if (closedQuote) {
      if (char === ",") {
        row.push(field); field = ""; closedQuote = false;
      } else if (char === "\n") {
        row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; closedQuote = false;
      } else if (char !== "\r") {
        throw new Error(`Malformed CSV near character ${index + 1}: unexpected text after a closing quote.`);
      }
    } else if (char === '"') {
      if (field.length) throw new Error(`Malformed CSV near character ${index + 1}: quote begins inside an unquoted field.`);
      quoted = true;
    } else if (char === ",") {
      row.push(field); field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("Malformed CSV: an enclosed field has no closing quote.");
  if (field.length || row.length || closedQuote) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

const aliasLookup = new Map();
for (const field of TARGET_FIELDS) {
  for (const alias of field.aliases) {
    const key = canonicalHeader(alias);
    const matches = aliasLookup.get(key) || [];
    matches.push(field.key);
    aliasLookup.set(key, matches);
  }
}

function populatedValues(row) {
  return row.map((value) => String(value ?? "").trim()).filter(Boolean);
}

function isNamedScaffolding(row) {
  const populated = populatedValues(row);
  if (!populated.length) return true;
  const first = populated[0].toLowerCase();
  return /^(title|summary|section|disclaimer|internal draft|resource asset management)(\b|:)/i.test(first);
}

function headerCandidate(rows, index) {
  const row = rows[index];
  const populated = populatedValues(row);
  if (!populated.length || isNamedScaffolding(row)) return null;
  const following = rows.slice(index + 1, index + 11).filter((candidate) => populatedValues(candidate).length);
  if (!following.length) return null;
  const normalized = populated.map(canonicalHeader).filter(Boolean);
  const unique = new Set(normalized).size;
  const known = normalized.filter((name) => aliasLookup.has(name)).length;
  const compatible = following.filter((candidate) => populatedValues(candidate).length <= Math.max(row.length + 2, 3)).length;
  return { index, score: known * 100 + populated.length * 4 + unique + compatible - index / 1000 };
}

function findPlausibleHeaderIndex(rows) {
  let best = null;
  rows.slice(0, 50).forEach((_, index) => {
    const candidate = headerCandidate(rows, index);
    if (candidate && (!best || candidate.score > best.score)) best = candidate;
  });
  if (!best) throw new Error("Could not identify a usable CSV header row. Include a header followed by at least one data row.");
  return best.index;
}

export function suggestCsvMapping(sourceColumns) {
  const mapping = Object.fromEntries(TARGET_FIELDS.map((field) => [field.key, null]));
  const claimed = new Set();
  for (const field of TARGET_FIELDS) {
    const aliases = new Set(field.aliases.map(canonicalHeader));
    const matches = sourceColumns.filter((column) => aliases.has(canonicalHeader(column.name)));
    if (matches.length === 1 && !claimed.has(matches[0].index)) {
      mapping[field.key] = matches[0].index;
      claimed.add(matches[0].index);
    }
  }
  return mapping;
}

export function inspectCsv(text) {
  const rows = parseCsv(text);
  if (!rows.some((row) => populatedValues(row).length)) throw new Error("The CSV is empty or contains only blank rows.");
  const headerIndex = findPlausibleHeaderIndex(rows);
  const header = rows[headerIndex];
  const sourceColumns = header.map((value, index) => ({
    index,
    name: String(value ?? "").trim() || `Unnamed column ${index + 1}`
  }));
  if (!sourceColumns.length) throw new Error("The detected header row has no source columns.");
  const suggestedMapping = suggestCsvMapping(sourceColumns);
  const exactKnownCount = header.filter((name) => EXPECTED_HEADERS.map(canonicalHeader).includes(canonicalHeader(name))).length;
  return {
    rows,
    headerIndex,
    headerRow: headerIndex + 1,
    sourceColumns,
    suggestedMapping,
    knownInventoryLayout: exactKnownCount >= 4 && header.map(canonicalHeader).includes(canonicalHeader("Asset Type"))
  };
}

function validateMapping(inspection, mapping) {
  const available = new Set(inspection.sourceColumns.map((column) => column.index));
  const targetKeys = new Set(TARGET_FIELDS.map((field) => field.key));
  const selected = [];
  for (const [key, value] of Object.entries(mapping || {})) {
    if (!targetKeys.has(key)) throw new Error(`Unknown target field: ${key}.`);
    if (value == null || value === "") continue;
    const index = Number(value);
    if (!Number.isInteger(index) || !available.has(index)) throw new Error(`The mapping for ${key} refers to an unavailable source column.`);
    selected.push([key, index]);
  }
  if (mapping?.assetType == null || mapping.assetType === "") throw new Error("Asset Type mapping is required before staging.");
  const duplicates = selected.filter(([, index], position) => selected.findIndex((entry) => entry[1] === index) !== position);
  if (duplicates.length) {
    const duplicateIndexes = new Set(duplicates.map((entry) => entry[1]));
    const names = inspection.sourceColumns.filter((column) => duplicateIndexes.has(column.index)).map((column) => `“${column.name}”`);
    throw new Error(`Each source column can be assigned only once. Duplicate assignment: ${names.join(", ")}.`);
  }
  return Object.fromEntries(selected);
}

export function mapCsvRecords(inspection, mapping) {
  if (!inspection || !Array.isArray(inspection.rows) || !Array.isArray(inspection.sourceColumns)) throw new Error("Inspect the CSV before applying a field mapping.");
  const selected = validateMapping(inspection, mapping);
  const records = [];
  let ignoredRows = inspection.headerIndex;
  for (const row of inspection.rows.slice(inspection.headerIndex + 1)) {
    const populated = populatedValues(row);
    if (!populated.length || isNamedScaffolding(row) || (inspection.knownInventoryLayout && populated.length < 3)) {
      ignoredRows += 1;
      continue;
    }
    const record = {};
    for (const field of TARGET_FIELDS) record[field.key] = selected[field.key] == null ? "" : String(row[selected[field.key]] ?? "");
    if (!record.assetType.trim()) {
      ignoredRows += 1;
      continue;
    }
    records.push(record);
  }
  if (!records.length) throw new Error("The mapped CSV does not contain any usable rows with an Asset Type value.");
  return { records, ignoredRows, headerRow: inspection.headerRow };
}

function findHeaderIndex(rows) {
  const expected = new Set(EXPECTED_HEADERS.map(canonicalHeader));
  let best = { index: -1, score: 0 };
  rows.slice(0, 50).forEach((row, index) => {
    const names = row.map(canonicalHeader);
    const score = names.filter((name) => expected.has(name)).length;
    const hasAsset = names.includes(canonicalHeader("Asset Type"));
    if (hasAsset && score > best.score) best = { index, score };
  });
  if (best.index < 0 || best.score < 4) {
    throw new Error("Could not find the inventory header row. Include Asset Type and the documented columns.");
  }
  return best.index;
}

function isNoiseRow(row) {
  const populated = populatedValues(row);
  if (!populated.length) return true;
  if (isNamedScaffolding(row)) return true;
  return populated.length < 3;
}

export function extractCsvRecords(text) {
  const rows = parseCsv(text);
  const headerIndex = findHeaderIndex(rows);
  const headers = rows[headerIndex].map(canonicalHeader);
  const expected = new Map(EXPECTED_HEADERS.map((header) => [canonicalHeader(header), header]));
  const records = [];
  let ignoredRows = headerIndex;

  for (const row of rows.slice(headerIndex + 1)) {
    if (isNoiseRow(row)) {
      ignoredRows += 1;
      continue;
    }
    const record = {};
    headers.forEach((header, index) => {
      const expectedName = expected.get(header);
      if (expectedName) record[expectedName] = row[index] ?? "";
    });
    if (!String(record["Asset Type"] ?? "").trim()) {
      ignoredRows += 1;
      continue;
    }
    records.push(record);
  }
  return { records, ignoredRows, headerRow: headerIndex + 1 };
}

export { EXPECTED_HEADERS };
