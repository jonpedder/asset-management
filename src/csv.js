const EXPECTED_HEADERS = [
  "Asset Type", "Dept", "Category", "Est. Qty", "Availability",
  "EOC Role / Use", "Operator Required?", "Status", "Gap Description",
  "Procurement Priority", "Est. Unit Cost", "Notes / Source"
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

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      if (field.length) field += char;
      else quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
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
  const populated = row.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (!populated.length) return true;
  const first = populated[0].toLowerCase();
  if (/^(title|summary|section|disclaimer|internal draft|resource asset management)(\b|:)/i.test(first)) return true;
  // The customer draft uses one-cell department headings and a one-cell disclaimer.
  // A valid inventory row must contain at least an asset type, department, and category/value.
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
