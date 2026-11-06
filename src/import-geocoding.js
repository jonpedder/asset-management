function text(value) { return String(value ?? "").trim(); }
function key(value) { return text(value).toLowerCase().replace(/\s+/g, " "); }

export function geocodeQuery(record) {
  const address = [record?.address, record?.city, record?.state, record?.zip].map(text).filter(Boolean).join(", ");
  return address || text(record?.locationName || record?.facility);
}

export function buildGeocodePlan(records = []) {
  const groups = new Map();
  records.forEach((record, index) => {
    if (record?.geometry) return;
    const query = geocodeQuery(record);
    const normalized = key(query);
    if (!normalized) return;
    const current = groups.get(normalized) || { id: groups.size + 1, query, recordIndexes: [] };
    current.recordIndexes.push(index);
    groups.set(normalized, current);
  });
  return [...groups.values()];
}

function point(location) {
  if (!location) return null;
  const source = typeof location.toJSON === "function" ? location.toJSON() : location;
  const x = Number.isFinite(source.x) ? source.x : Number.isFinite(source.longitude) ? source.longitude : null;
  const y = Number.isFinite(source.y) ? source.y : Number.isFinite(source.latitude) ? source.latitude : null;
  if (x == null || y == null) return null;
  return { type: "point", x, y, spatialReference: { wkid: Number(source.spatialReference?.wkid || source.spatialReference?.latestWkid || 4326) } };
}

export function applyGeocodeCandidates(records = [], plan = [], candidates = [], minimumScore = 80) {
  const byId = new Map(candidates.map((candidate) => [Number(candidate.resultId), candidate]));
  const output = records.map((record) => ({ ...record }));
  let geocoded = 0;
  let unresolved = 0;
  for (const request of plan) {
    const candidate = byId.get(request.id);
    const geometry = candidate && Number(candidate.score) >= minimumScore ? point(candidate.location) : null;
    for (const index of request.recordIndexes) {
      if (!geometry) { unresolved += 1; continue; }
      output[index] = { ...output[index], geometry, isMockLocation: false, locationMethod: `Geocoded address from imported CSV · score ${Math.round(Number(candidate.score))}` };
      geocoded += 1;
    }
  }
  return { records: output, geocoded, unresolved };
}
