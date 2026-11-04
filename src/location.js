import { normalizeKey } from "./normalize.js";

function attributeText(record) {
  const attributes = record?.attributes ?? record ?? {};
  return Object.values(attributes).filter((value) => typeof value === "string").join(" ");
}

export function pointFromGeometry(geometry) {
  if (!geometry) return null;
  if (Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) {
    return { type: "point", x: geometry.x, y: geometry.y, spatialReference: geometry.spatialReference };
  }
  if (Number.isFinite(geometry.longitude) && Number.isFinite(geometry.latitude)) {
    return { type: "point", longitude: geometry.longitude, latitude: geometry.latitude };
  }
  const center = geometry.centroid || geometry.extent?.center || geometry.center;
  if (center) return pointFromGeometry(center);
  if (geometry.extent && [geometry.extent.xmin, geometry.extent.xmax, geometry.extent.ymin, geometry.extent.ymax].every(Number.isFinite)) {
    return {
      type: "point",
      x: (geometry.extent.xmin + geometry.extent.xmax) / 2,
      y: (geometry.extent.ymin + geometry.extent.ymax) / 2,
      spatialReference: geometry.extent.spatialReference || geometry.spatialReference
    };
  }
  return null;
}

function scoreMatch(imported, candidate, mode) {
  const target = normalizeKey(mode === "resource" ? imported.assetType : imported.department);
  if (!target) return 0;
  const text = normalizeKey(attributeText(candidate));
  if (!text) return 0;
  let score = text === target ? 100 : text.includes(target) ? 70 : target.includes(text) ? 55 : 0;
  if (mode === "resource" && imported.department && text.includes(normalizeKey(imported.department))) score += 15;
  if (mode === "resource" && imported.category && text.includes(normalizeKey(imported.category))) score += 10;
  return score;
}

function bestMatch(imported, candidates, mode) {
  return candidates
    .map((candidate) => ({ candidate, score: scoreMatch(imported, candidate, mode) }))
    .filter(({ candidate, score }) => score > 0 && pointFromGeometry(candidate.geometry))
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? null;
}

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function deterministicCountyPoint(record, center = { longitude: -98.5795, latitude: 39.8283 }) {
  const seed = hash(`${record.assetType}|${record.department}|${record.id}`);
  const angle = (seed % 3600) / 3600 * Math.PI * 2;
  const radial = 0.08 + ((seed >>> 8) % 1000) / 1000 * 0.22;
  return {
    type: "point",
    longitude: center.longitude + Math.cos(angle) * radial,
    latitude: center.latitude + Math.sin(angle) * radial
  };
}

export function assignLocations(records, resources = [], facilities = [], center) {
  const summary = { resourceMatches: 0, facilityMatches: 0, mocked: 0, total: records.length };
  const located = records.map((record) => {
    const resource = bestMatch(record, resources, "resource");
    if (resource) {
      summary.resourceMatches += 1;
      return { ...record, geometry: pointFromGeometry(resource.geometry), locationMethod: "Existing resource match", isMockLocation: false };
    }
    const facility = bestMatch(record, facilities, "facility");
    if (facility) {
      summary.facilityMatches += 1;
      return { ...record, geometry: pointFromGeometry(facility.geometry), locationMethod: "Facility match", isMockLocation: false };
    }
    summary.mocked += 1;
    return { ...record, geometry: deterministicCountyPoint(record, center), locationMethod: "Deterministic mocked county point", isMockLocation: true };
  });
  const validated = summary.resourceMatches + summary.facilityMatches;
  summary.coveragePercent = summary.total ? Math.round(validated / summary.total * 100) : 0;
  return { records: located, summary };
}
