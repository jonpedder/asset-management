import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildHelpPdf } from "../src/help-pdf.js";

test("help generator returns a valid PDF 1.4 document", async () => {
  const blob = buildHelpPdf([{ title: "Purpose", blocks: [{ kind: "paragraph", text: "Read-only inventory guidance." }] }], new Date("2026-01-01T00:00:00Z"), { appName: "County Assets", colors: { accent: "#f2a900" } });
  const text = await blob.text();
  assert.equal(blob.type, "application/pdf"); assert.match(text, /^%PDF-1\.4/); assert.match(text, /%%EOF$/); assert.match(text, /County Assets/);
});

test("settings page exposes tabs, local configuration, help, and PDF action", async () => {
  const html = await readFile(new URL("../settings.html", import.meta.url), "utf8");
  assert.match(html, /role="tablist"/); assert.match(html, />Settings<\/button>/); assert.match(html, />Configuration<\/button>/); assert.match(html, />Help &amp; How-to<\/button>/);
  assert.match(html, /id="downloadHelpPdf"/); assert.match(html, /localStorage/); assert.match(html, /300 KB/); assert.match(html, /32-row customer draft/); assert.match(html, /1,465/);
});

test("main runtime loads merged config and applies presentation", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /import \{ loadConfig \}/); assert.match(app, /import \{ applyPresentation \}/); assert.match(app, /await loadConfig\("\.\/config\/app\.json"\)/); assert.match(app, /applyPresentation\(state\.config\)/);
});
