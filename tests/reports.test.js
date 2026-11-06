import assert from "node:assert/strict";
import test from "node:test";
import { availableResourcesReport, inventoryGapStatusReport, reportSummary, resourcesAtFacilitiesReport } from "../src/report-data.js";
import { buildInventoryReportPdf } from "../src/report-pdf.js";
import { buildGapStatusReportPdf } from "../src/gap-report-pdf.js";

const resources = [
  { assetType: "Generator", department: "Public Works", category: "Public Works", quantity: { raw: "3", estimate: 3 }, availability: "Available", status: "Have", locationName: "North EOC", eocRole: "Emergency power", operator: "No", priority: "N/A", unitCost: { raw: "$8,000-$25,000" } },
  { assetType: "Ambulance", department: "Health", category: "Health and Medical", quantity: { raw: "2", estimate: 2 }, status: "Ready", locationName: "North EOC", operator: "Certified operator", priority: "P1 - Critical" },
  { assetType: "Truck", department: "Public Works", category: "Public Works", quantity: { raw: "5", estimate: 5 }, availability: "Committed", status: "Gap - Need More", locationName: "South EOC", gapDescription: "Need two more", priority: "P2 - High" }
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

test("gap status report uses a landscape spreadsheet layout with grouped departments and conditional cells", async () => {
  const report = inventoryGapStatusReport(resources, "department: Public Works");
  assert.equal(report.metrics.records, 3);
  assert.equal(report.metrics.quantity, 10);
  assert.equal(report.groups.length, 2);
  const blob = buildGapStatusReportPdf(report, new Date("2026-01-01T00:00:00Z"), { appName: "San Mateo County Assets", subtitle: "EOC Field Asset Resource Library" });
  const pdf = await blob.text();
  assert.equal(blob.type, "application/pdf");
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\/MediaBox \[0 0 792 612\]/);
  assert.match(pdf, /Current Inventory & Gap Status/);
  assert.match(pdf, /Asset Type/);
  assert.match(pdf, /PUBLIC WORKS - 2 RESOURCES/);
  assert.match(pdf, /Gap - Need More/);
  assert.match(pdf, /INTERNAL WORKING REPORT/);
  assert.match(pdf, /%%EOF$/);
});
