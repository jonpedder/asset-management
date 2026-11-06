import assert from "node:assert/strict";
import test from "node:test";
import { availableResourcesReport, reportSummary, resourcesAtFacilitiesReport } from "../src/report-data.js";
import { buildInventoryReportPdf } from "../src/report-pdf.js";

const resources = [
  { assetType: "Generator", category: "Public Works", quantity: { estimate: 3 }, availability: "Available", locationName: "North EOC" },
  { assetType: "Ambulance", category: "Health and Medical", quantity: { estimate: 2 }, status: "Ready", locationName: "North EOC" },
  { assetType: "Truck", category: "Public Works", quantity: { estimate: 5 }, availability: "Committed", locationName: "South EOC" }
];
const facilities = [{ name: "North EOC", type: "EOC", status: "Open" }, { name: "South EOC", type: "Staging", status: "Open" }];

test("report adapters honor their supplied filtered resource scope", () => {
  const summary = reportSummary(resources.slice(0, 2), facilities, "facility: North EOC");
  assert.deepEqual(summary.sections[0].rows.slice(0, 4), [["Filtered resource records", 2], ["Filtered resource quantity", 5], ["Available resource records", 2], ["Available resource quantity", 5]]);
  const facility = resourcesAtFacilitiesReport(resources);
  assert.equal(facility.sections[0].rows.length, 2);
  assert.equal(facility.sections[1].rows.length, 3);
  const available = availableResourcesReport(resources);
  assert.equal(available.records.length, 2);
  assert.equal(available.sections[2].rows.length, 2);
});

test("inventory report builder creates a PDF with tables and an optional map image", async () => {
  const report = availableResourcesReport(resources);
  const blob = buildInventoryReportPdf(report, new Date("2026-01-01T00:00:00Z"), { appName: "County Assets", mapImage: { bytes: new Uint8Array([255, 216, 255, 217]), width: 10, height: 10 }, colors: { accent: "#f2a900" } });
  const pdf = await blob.text();
  assert.equal(blob.type, "application/pdf");
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /RESOURCES AVAILABLE/);
  assert.match(pdf, /\/MapImage/);
  assert.match(pdf, /AVAILABLE RESOURCE LIST/);
  assert.match(pdf, /%%EOF$/);
});
