function text(value, fallback = "Not provided") { const result = String(value ?? "").trim(); return result || fallback; }
function key(value) { return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " "); }
function quantity(record) { const value = Number(record?.quantity?.estimate); return Number.isFinite(value) ? value : 0; }
export function isResourceAvailable(record) {
  const value = key(record?.availability || record?.status);
  return ["available", "ready", "have", "in service", "yes"].includes(value);
}
export function resourceFacilityName(record) { return text(record?.facility || record?.locationName, "Unassigned"); }
function grouped(resources, value) {
  const rows = new Map();
  for (const record of resources) {
    const label = text(value(record), "Unspecified");
    const current = rows.get(label) || { label, records: 0, quantity: 0, available: 0 };
    current.records += 1; current.quantity += quantity(record); if (isResourceAvailable(record)) current.available += quantity(record);
    rows.set(label, current);
  }
  return [...rows.values()].sort((a, b) => b.records - a.records || a.label.localeCompare(b.label));
}
export function reportSummary(resources = [], facilities = [], scopeLabel = "Current list filters") {
  const available = resources.filter(isResourceAvailable);
  return {
    title: "Inventory Summary Report", scopeLabel,
    sections: [
      { title: "Report summary", columns: ["Measure", "Value"], rows: [
        ["Filtered resource records", resources.length],
        ["Filtered resource quantity", resources.reduce((sum, record) => sum + quantity(record), 0)],
        ["Available resource records", available.length],
        ["Available resource quantity", available.reduce((sum, record) => sum + quantity(record), 0)],
        ["Facilities represented", facilities.length]
      ] },
      { title: "Resources by category", columns: ["Category", "Records", "Quantity"], rows: grouped(resources, (record) => record.category).map((row) => [row.label, row.records, row.quantity]) },
      { title: "Facilities", columns: ["Facility", "Type", "Status"], rows: facilities.map((facility) => [text(facility.name), text(facility.type), text(facility.status, "Unknown")]) }
    ]
  };
}
export function resourcesAtFacilitiesReport(resources = [], scopeLabel = "Current list filters") {
  const byFacility = grouped(resources, resourceFacilityName);
  return {
    title: "Resources at a Facility", scopeLabel,
    sections: [
      { title: "Facility summary", columns: ["Facility", "Records", "Available quantity"], rows: byFacility.map((row) => [row.label, row.records, row.available]) },
      { title: "Resource detail", columns: ["Facility", "Resource", "Category", "Quantity", "Status"], rows: [...resources].sort((a, b) => resourceFacilityName(a).localeCompare(resourceFacilityName(b)) || text(a.assetType).localeCompare(text(b.assetType))).map((record) => [resourceFacilityName(record), text(record.assetType), text(record.category), quantity(record), text(record.availability || record.status, "Unknown")]) }
    ]
  };
}
export function availableResourcesReport(resources = [], scopeLabel = "Current list filters") {
  const available = resources.filter(isResourceAvailable);
  return {
    title: "Resources Available", scopeLabel, records: available,
    sections: [
      { title: "Available summary", columns: ["Measure", "Value"], rows: [["Available resource records", available.length], ["Available quantity", available.reduce((sum, record) => sum + quantity(record), 0)]] },
      { title: "Available by category", columns: ["Category", "Records", "Quantity"], rows: grouped(available, (record) => record.category).map((row) => [row.label, row.records, row.quantity]) },
      { title: "Available resource list", columns: ["Resource", "Category", "Facility", "Quantity", "Status"], rows: available.map((record) => [text(record.assetType), text(record.category), resourceFacilityName(record), quantity(record), text(record.availability || record.status, "Available")]) }
    ]
  };
}
