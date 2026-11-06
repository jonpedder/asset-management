const iconUrl = (name) => new URL(`../assets/resource-icons/${name}.svg`, import.meta.url).href;

export const RESOURCE_SYMBOLS = [
  { value: "communications", label: "Communications", icon: "tower-broadcast", keywords: ["communication", "radio", "telecom", "antenna"] },
  { value: "public-works", label: "Public Works", icon: "helmet-safety", keywords: ["public works", "engineering", "infrastructure", "construction", "debris"] },
  { value: "medical", label: "Health and Medical", icon: "kit-medical", keywords: ["medical", "health", "ems", "ambulance", "hospital"] },
  { value: "hazmat", label: "Hazardous Materials", icon: "biohazard", keywords: ["hazardous", "hazmat", "chemical", "radiological", "biological"] },
  { value: "law-enforcement", label: "Law Enforcement and Security", icon: "shield-halved", keywords: ["law enforcement", "security", "police", "sheriff"] },
  { value: "search-rescue", label: "Search and Rescue", icon: "magnifying-glass-location", keywords: ["search and rescue", "usar", "rescue"] },
  { value: "fire", label: "Firefighting", icon: "fire-extinguisher", keywords: ["fire", "suppression", "wildland"] },
  { value: "mass-care", label: "Mass Care and Shelter", icon: "people-roof", keywords: ["mass care", "shelter", "housing", "human services"] },
  { value: "transportation", label: "Transportation", icon: "truck-fast", keywords: ["transportation", "ground support", "fleet", "vehicle"] },
  { value: "animals-agriculture", label: "Animals and Agriculture", icon: "paw", keywords: ["animal", "agriculture", "veterinary"] },
  { value: "energy", label: "Energy and Utilities", icon: "bolt", keywords: ["energy", "electric", "power", "utility"] },
  { value: "water", label: "Water and Supply", icon: "droplet", keywords: ["water", "potable", "wastewater"] },
  { value: "facilities", label: "Facilities and Command", icon: "building-shield", keywords: ["command", "facility", "eoc", "management"] },
  { value: "other", label: "Other Resources", icon: "boxes-stacked", keywords: [] }
].map((definition) => ({ ...definition, url: iconUrl(definition.icon) }));

export function resourceSymbolFor(record = {}, overrideUrl = "") {
  const text = `${record.category || ""} ${record.assetType || ""}`.toLowerCase();
  const definition = RESOURCE_SYMBOLS.find((item) => item.keywords.some((keyword) => text.includes(keyword))) || RESOURCE_SYMBOLS.at(-1);
  return overrideUrl ? { ...definition, url: overrideUrl } : definition;
}

export function resourceLabelingInfo(fieldName = "ResourceName") {
  const field = String(fieldName).replaceAll('"', "");
  return [{
    labelExpressionInfo: { expression: `$feature["${field}"]` },
    labelPlacement: "above-center",
    minScale: 250000,
    maxScale: 0,
    symbol: {
      type: "text",
      color: "#ffffff",
      haloColor: "#071824",
      haloSize: 1.5,
      yoffset: 10,
      font: { family: "Arial", size: 9, weight: "bold" }
    }
  }];
}

export function resourceRenderer(fieldName, overrideUrl = "") {
  if (overrideUrl) return { type: "simple", symbol: { type: "picture-marker", url: overrideUrl, width: "14pt", height: "14pt" } };
  const field = String(fieldName || "NIMS_Category").replaceAll('"', "");
  const clauses = RESOURCE_SYMBOLS.filter((definition) => definition.value !== "other").map((definition) => {
    const tests = definition.keywords.map((keyword) => `Includes(value, '${keyword.replaceAll("'", "\\'")}')`).join(" || ");
    return `${tests}, '${definition.value}'`;
  });
  return {
    type: "unique-value",
    valueExpressionTitle: "Resource category",
    valueExpression: `var value = Lower(DefaultValue(Text($feature["${field}"]), '')); return When(${clauses.join(", ")}, 'other');`,
    uniqueValueInfos: RESOURCE_SYMBOLS.map((definition) => ({
      value: definition.value,
      label: definition.label,
      symbol: { type: "picture-marker", url: definition.url, width: "14pt", height: "14pt" }
    })),
    defaultLabel: "Other Resources",
    defaultSymbol: { type: "picture-marker", url: RESOURCE_SYMBOLS.at(-1).url, width: "14pt", height: "14pt" }
  };
}
