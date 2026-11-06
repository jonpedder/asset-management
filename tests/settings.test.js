import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildHelpPdf } from "../src/help-pdf.js";

test("help generator returns a valid PDF 1.4 document", async () => {
  const blob = buildHelpPdf([{ title: "Purpose", blocks: [{ kind: "paragraph", text: "Read-only inventory guidance." }] }], new Date("2026-01-01T00:00:00Z"), { appName: "County Assets", colors: { accent: "#f2a900" } });
  const text = await blob.text();
  assert.equal(blob.type, "application/pdf"); assert.match(text, /^%PDF-1\.4/); assert.match(text, /%%EOF$/); assert.match(text, /County Assets/);
});

test("settings page exposes import controls, tabs, help, and PDF action", async () => {
  const html = await readFile(new URL("../settings.html", import.meta.url), "utf8");
  assert.match(html, /role="tablist"/); assert.match(html, />Settings<\/button>/); assert.match(html, />Configuration<\/button>/); assert.match(html, />Help &amp; How-to<\/button>/);
  assert.match(html, /id="settingsImportForm"/); assert.match(html, /id="settingsCsvFile"/); assert.match(html, /id="clearStagedImport"/); assert.match(html, /id="openInventoryMap"/);
  assert.match(html, /sessionStorage/); assert.match(html, /Map any headings/); assert.match(html, /id="fieldMappingRegion"/); assert.match(html, /id="mappingRows"/); assert.match(html, /id="resetAutomaticMappings"/); assert.match(html, /id="mappingPreview"/);
  assert.match(html, /Asset Type is required/); assert.match(html, /id="downloadHelpPdf"/); assert.match(html, /localStorage/); assert.match(html, /300 KB/); assert.match(html, /32-row customer draft/); assert.match(html, /1,465/);
});

test("settings runtime inspects, maps, previews, normalizes, and stages the selected CSV", async () => {
  const source = await readFile(new URL("../src/settings.js", import.meta.url), "utf8");
  assert.match(source, /inspectCsv\(text\)/);
  assert.match(source, /mapCsvRecords\(importInspection, importMapping\)/);
  assert.match(source, /result\.records\.slice\(0, 5\)/);
  assert.match(source, /records\.map\(normalizeImportedRecord\)/);
  assert.match(source, /saveImportSession/);
  assert.match(source, /settingsCsvFile.*change.*inspectSelectedFile/);
});

test("main page has no import dialog and places a square settings cog at the far right", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /id="importButton"/); assert.doesNotMatch(html, /id="importDialog"/); assert.doesNotMatch(html, /id="csvFile"/);
  assert.match(html, /id="signInButton"[\s\S]*id="signOutButton"[\s\S]*id="serviceStatus"[\s\S]*id="lastUpdated"[\s\S]*id="settingsLink"/); assert.match(html, /class="settings-cog"/); assert.match(html, /class="sr-only">Settings<\/span>/);
  assert.doesNotMatch(html, /class="status-strip"/); assert.match(html, /class="header-data-status"/);
  assert.match(html, /id="bulkHeading">Bulk facility assignment[\s\S]*id="resetSortOrder"[\s\S]*Reset sort order/);
});

test("main runtime loads config, consumes staged imports, and applies presentation", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /import \{ readImportSession, updateImportSessionRecord, updateImportSessionRecords, validateImportSessionRecordUpdates \}/); assert.match(app, /state\.stagedImport = readImportSession\(\)/); assert.match(app, /consumeStagedImport\(\)/); assert.match(app, /assignLocations\(/);
  assert.match(app, /import \{ loadConfig \}/); assert.match(app, /import \{ applyPresentation \}/); assert.match(app, /await loadConfig\("\.\/config\/app\.json"\)/); assert.match(app, /applyPresentation\(state\.config\)/);
  assert.match(app, /resetSortOrder\.addEventListener\("click"[\s\S]*resourceSort = \{ key: null[\s\S]*facilitySort = \{ key: null/);
  assert.equal((app.match(/<details class="editing-information">/g) || []).length, 2);
  assert.match(app, /<summary>Editing Information<\/summary>/); assert.doesNotMatch(app, /<details class="editing-information" open>/);
  assert.doesNotMatch(app, /importButton|importDialog|importForm|csvFile/);
});
