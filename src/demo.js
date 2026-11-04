export const DEMO_RESOURCES = [
  { id: "demo-1", assetType: "Portable generator", department: "Public Works", category: "Power", quantity: { raw: "3", min: 3, max: 3, estimate: 3 }, status: "Available", priority: "Medium", operator: "Required", geometry: { type: "point", longitude: -98.57, latitude: 39.85 }, source: "Invented demo data", sourceType: "demo", locationMethod: "Invented demo location", isMockLocation: false, notes: "Demonstration only — not customer or operational data." },
  { id: "demo-2", assetType: "Water tender", department: "Fire & Rescue", category: "Water", quantity: { raw: "1", min: 1, max: 1, estimate: 1 }, status: "Limited", priority: "High", operator: "Required", geometry: { type: "point", longitude: -98.63, latitude: 39.80 }, source: "Invented demo data", sourceType: "demo", locationMethod: "Invented demo location", isMockLocation: false, notes: "Demonstration only — not customer or operational data." },
  { id: "demo-3", assetType: "Shelter supply kit", department: "Emergency Management", category: "Mass Care", quantity: { raw: "24", min: 24, max: 24, estimate: 24 }, status: "Available", priority: "Low", operator: "Not required", geometry: { type: "point", longitude: -98.52, latitude: 39.78 }, source: "Invented demo data", sourceType: "demo", locationMethod: "Invented demo location", isMockLocation: false, notes: "Demonstration only — not customer or operational data." }
];

export const DEMO_FACILITIES = [
  { id: "demo-facility-1", name: "North Operations Center", type: "Operations", status: "Open", geometry: { type: "point", longitude: -98.60, latitude: 39.86 }, source: "Invented demo data", sourceType: "demo" },
  { id: "demo-facility-2", name: "Community Staging Site", type: "Staging", status: "Standby", geometry: { type: "point", longitude: -98.50, latitude: 39.82 }, source: "Invented demo data", sourceType: "demo" }
];
