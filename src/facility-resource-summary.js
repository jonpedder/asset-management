function key(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isAvailable(record) {
  const value = key(record?.availability || record?.status);
  return value === "available" || value === "have" || value === "ready" || value === "in service" || value === "yes";
}

function quantity(record) {
  const estimate = Number(record?.quantity?.estimate);
  if (Number.isFinite(estimate) && estimate >= 0) return estimate;
  const raw = Number(record?.quantity?.raw);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1;
}

export function summarizeFacilityResources(resources = [], facilityName = "") {
  const target = key(facilityName);
  if (!target) return { facilityName: "", totalQuantity: 0, totalRecords: 0, types: [] };
  const grouped = new Map();
  for (const record of resources) {
    const location = key(record?.locationName || record?.facility);
    if (location !== target || !isAvailable(record)) continue;
    const type = String(record?.category || record?.assetType || "Unspecified resource").trim() || "Unspecified resource";
    const current = grouped.get(type) || { type, quantity: 0, records: 0 };
    current.quantity += quantity(record);
    current.records += 1;
    grouped.set(type, current);
  }
  const types = [...grouped.values()].sort((a, b) => b.quantity - a.quantity || a.type.localeCompare(b.type));
  return {
    facilityName: String(facilityName).trim(),
    totalQuantity: types.reduce((sum, item) => sum + item.quantity, 0),
    totalRecords: types.reduce((sum, item) => sum + item.records, 0),
    types
  };
}
