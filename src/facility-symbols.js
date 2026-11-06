export const FACILITY_SYMBOL_URL = new URL("../assets/resource-icons/facility-management.svg", import.meta.url).href;

export function facilityRenderer(overrideUrl = "") {
  return {
    type: "simple",
    symbol: { type: "picture-marker", url: overrideUrl || FACILITY_SYMBOL_URL, width: "14pt", height: "14pt" }
  };
}

export function facilityLabelingInfo(fieldName = "SiteName") {
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
