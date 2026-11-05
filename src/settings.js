import { clearConfigOverrides, loadConfig, mergeConfig, saveConfigOverrides, validateConfig } from "./config.js";
import { applyPresentation } from "./presentation.js";
import { buildHelpPdf } from "./help-pdf.js";
import { inspectCsv, mapCsvRecords, TARGET_FIELDS } from "./csv.js";
import { normalizeImportedRecord } from "./normalize.js";
import { clearImportSession, readImportSession, saveImportSession } from "./import-session.js";

const $ = (id) => document.getElementById(id);
const defaults = {
  colors: { navy: "#003b5c", background: "#071824", panel: "#0c2231", panelAlt: "#123247", panelStrong: "#173d55", border: "#28495b", text: "#f4f7f9", muted: "#afc3cf", faint: "#7893a2", accent: "#f2a900", accentStrong: "#ffc94c", blue: "#4fa3d1", green: "#36b37e", red: "#e05262", focus: "#8bd3ff" },
  status: { available: "#36b37e", limited: "#f2a900", unavailable: "#e05262", unknown: "#afc3cf" },
  resource: { current: "#36b37e", imported: "#f2a900", mocked: "#e05262", demo: "#8bd3ff" }
};
let config; let draftLogo = "";
let importInspection = null;
let importMapping = {};
let fileReadSequence = 0;

function announce(message, tone = "success") {
  $("saveStatus").textContent = message;
  const node = document.createElement("div"); node.className = `toast ${tone}`; node.setAttribute("role", tone === "error" ? "alert" : "status"); node.textContent = message; $("toastRegion").append(node);
  setTimeout(() => node.remove(), 4500);
}
function previewLogo(url, message = "") {
  draftLogo = url; $("logoPreview").hidden = !url; $("defaultLogoPreview").hidden = Boolean(url);
  if (url) $("logoPreview").src = url;
  $("logoStatus").textContent = message;
}
function renderImportSession(payload, message = "") {
  $("stagedLoadedCount").textContent = payload?.records?.length ?? 0;
  $("stagedIgnoredCount").textContent = payload?.ignoredRows ?? 0;
  $("clearStagedImport").disabled = !payload;
  const feedback = $("settingsImportFeedback");
  feedback.className = `feedback${payload ? " success" : ""}`;
  feedback.textContent = message || (payload
    ? `${payload.records.length} normalized inventory rows are staged for this tab/session; ${payload.ignoredRows} rows were ignored. Open the Inventory map to resolve locations.`
    : "No CSV is staged in this browser session.");
}
function clearMappingUi() {
  importInspection = null;
  importMapping = {};
  $("fieldMappingRegion").hidden = true;
  $("mappingRows").replaceChildren();
  $("detectedSourceColumns").replaceChildren();
  $("mappingPreview").hidden = true;
  $("mappingPreviewHead").replaceChildren();
  $("mappingPreviewBody").replaceChildren();
  $("mappingValidation").className = "feedback";
  $("mappingValidation").textContent = "";
  $("stageImport").disabled = true;
}
function currentMappingFromControls() {
  return Object.fromEntries([...$("mappingRows").querySelectorAll("select[data-target-field]")].map((select) => [
    select.dataset.targetField,
    select.value === "" ? null : Number(select.value)
  ]));
}
function renderMappedPreview() {
  if (!importInspection) return;
  importMapping = currentMappingFromControls();
  const validation = $("mappingValidation");
  try {
    const result = mapCsvRecords(importInspection, importMapping);
    const mappedFields = TARGET_FIELDS.filter((field) => importMapping[field.key] != null);
    const headRow = document.createElement("tr");
    for (const field of mappedFields) { const th = document.createElement("th"); th.scope = "col"; th.textContent = field.label; headRow.append(th); }
    $("mappingPreviewHead").replaceChildren(headRow);
    $("mappingPreviewBody").replaceChildren(...result.records.slice(0, 5).map((record) => {
      const tr = document.createElement("tr");
      for (const field of mappedFields) { const td = document.createElement("td"); td.textContent = record[field.key] || "—"; tr.append(td); }
      return tr;
    }));
    $("mappingPreview").hidden = false;
    validation.className = "feedback success";
    validation.textContent = `${result.records.length} usable row${result.records.length === 1 ? "" : "s"} ready to stage; previewing the first ${Math.min(5, result.records.length)}.`;
    $("stageImport").disabled = false;
  } catch (error) {
    $("mappingPreview").hidden = true;
    $("mappingPreviewHead").replaceChildren();
    $("mappingPreviewBody").replaceChildren();
    validation.className = "feedback error";
    validation.textContent = error.message;
    $("stageImport").disabled = true;
  }
}
function applyAutomaticMappings() {
  if (!importInspection) return;
  importMapping = { ...importInspection.suggestedMapping };
  for (const select of $("mappingRows").querySelectorAll("select[data-target-field]")) {
    const selected = importMapping[select.dataset.targetField];
    select.value = selected == null ? "" : String(selected);
  }
  renderMappedPreview();
}
function renderMappingControls(inspection, fileName) {
  $("fieldMappingRegion").hidden = false;
  $("detectedHeaderSummary").textContent = `${fileName}: detected header row ${inspection.headerRow} with ${inspection.sourceColumns.length} source column${inspection.sourceColumns.length === 1 ? "" : "s"}.`;
  $("detectedSourceColumns").replaceChildren(...inspection.sourceColumns.map((column) => {
    const span = document.createElement("span"); span.textContent = `${column.index + 1}. ${column.name}`; return span;
  }));
  const rows = TARGET_FIELDS.map((field) => {
    const tr = document.createElement("tr");
    const name = document.createElement("th"); name.scope = "row"; name.textContent = field.label;
    const requirement = document.createElement("td"); requirement.textContent = field.required ? "Required" : "Optional"; requirement.className = field.required ? "required-field" : "optional-field";
    const cell = document.createElement("td"); const label = document.createElement("label"); label.className = "sr-only"; label.htmlFor = `map-${field.key}`; label.textContent = `Incoming CSV column for ${field.label}`;
    const select = document.createElement("select"); select.id = `map-${field.key}`; select.dataset.targetField = field.key; select.required = field.required;
    const none = document.createElement("option"); none.value = ""; none.textContent = "Not mapped"; select.append(none);
    for (const column of inspection.sourceColumns) { const option = document.createElement("option"); option.value = String(column.index); option.textContent = `${column.index + 1}. ${column.name}`; select.append(option); }
    select.addEventListener("change", renderMappedPreview); cell.append(label, select); tr.append(name, requirement, cell); return tr;
  });
  $("mappingRows").replaceChildren(...rows);
  applyAutomaticMappings();
}
async function inspectSelectedFile() {
  const sequence = ++fileReadSequence;
  const file = $("settingsCsvFile").files?.[0];
  clearMappingUi();
  const feedback = $("settingsImportFeedback");
  feedback.className = "feedback";
  if (!file) { feedback.textContent = "Choose a CSV to inspect its columns locally."; return; }
  try {
    const maxBytes = config?.import?.maxFileBytes ?? 10_000_000;
    if (file.size > maxBytes) throw new Error(`CSV exceeds the ${Math.round(maxBytes / 1_000_000)} MB local import limit.`);
    feedback.textContent = "Inspecting the CSV locally…";
    const text = await file.text();
    if (sequence !== fileReadSequence) return;
    importInspection = inspectCsv(text);
    renderMappingControls(importInspection, file.name);
    feedback.className = "feedback success";
    feedback.textContent = "CSV parsed locally. Review the detected columns, mappings, and preview before staging.";
  } catch (error) {
    if (sequence !== fileReadSequence) return;
    clearMappingUi();
    feedback.className = "feedback error";
    feedback.textContent = error.message;
    announce(error.message, "error");
  }
}
function stageImport(event) {
  event.preventDefault();
  const feedback = $("settingsImportFeedback");
  try {
    if (!$("settingsCsvFile").files?.[0] || !importInspection) throw new Error("Choose and inspect a CSV file before staging.");
    const { records, ignoredRows, headerRow } = mapCsvRecords(importInspection, currentMappingFromControls());
    const payload = saveImportSession(records.map(normalizeImportedRecord), { ignoredRows, headerRow });
    renderImportSession(payload, `${payload.records.length} rows loaded from header row ${headerRow}; ${ignoredRows} scaffolding or non-data rows ignored. The selected mapping was normalized and staged only for this tab/session.`);
    announce(`Staged ${payload.records.length} inventory rows for the map.`);
  } catch (error) {
    feedback.className = "feedback error";
    feedback.textContent = error.message;
    announce(error.message, "error");
  }
}
function setTab(name, focus = false) {
  for (const key of ["settings", "configuration", "help"]) {
    const active = key === name; const tab = $(`${key}Tab`);
    $(`${key}Panel`).hidden = !active; tab.classList.toggle("active", active); tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  }
  const help = name === "help"; $("save").hidden = help; $("reset").hidden = help;
}
function populate(c) {
  config = c; applyPresentation(c);
  const brand = c.branding || {}; const labels = c.labels || {}; const colors = { ...defaults.colors, ...brand.colors }; const status = { ...defaults.status, ...c.statusColors }; const resource = { ...defaults.resource, ...c.resourceColors };
  $("appName").value = brand.appName || "Asset Management"; $("subtitle").value = brand.subtitle || "Operational inventory preview"; $("logoUrl").value = brand.logoUrl?.startsWith("data:") ? "" : brand.logoUrl || ""; previewLogo(brand.logoUrl || "", brand.logoUrl ? "Current custom logo." : "Default AM mark selected.");
  for (const [id, key, fallback] of [["inventoryHeading", "inventoryHeading", "Resources & facilities"], ["resourcesLabel", "resourcesTab", "Resources"], ["facilitiesLabel", "facilitiesTab", "Facilities"], ["importLabel", "settingsImport", "Import local CSV"], ["selectionHeading", "selectionHeading", "Inventory detail"]]) $(id).value = labels[key] || fallback;
  for (const [id, key] of [["navy", "navy"], ["background", "background"], ["panel", "panel"], ["panelAlt", "panelAlt"], ["panelStrong", "panelStrong"], ["border", "border"], ["textColor", "text"], ["muted", "muted"], ["faint", "faint"], ["accent", "accent"], ["accentStrong", "accentStrong"], ["blue", "blue"], ["green", "green"], ["red", "red"], ["focus", "focus"]]) $(id).value = colors[key];
  for (const [id, key] of [["statusAvailable", "available"], ["statusLimited", "limited"], ["statusUnavailable", "unavailable"], ["statusUnknown", "unknown"]]) $(id).value = status[key];
  for (const [id, key] of [["resourceCurrent", "current"], ["resourceImported", "imported"], ["resourceMocked", "mocked"], ["resourceDemo", "demo"]]) $(id).value = resource[key];
  $("showMockedPoints").checked = c.operatorDefaults?.showMockedPoints !== false; $("compactInventory").checked = Boolean(c.operatorDefaults?.compactInventory); $("defaultSourceFilter").value = c.operatorDefaults?.defaultSourceFilter || "";
  $("portalUrl").value = c.portalUrl || ""; $("oauthClientId").value = c.oauth?.clientId || ""; $("oauthMode").value = c.oauth?.mode || "redirect"; $("oauthRedirectUrl").value = c.oauth?.redirectUrl || "";
  $("featureServiceItemId").value = c.featureServiceItemId || ""; $("serviceUrl").value = c.serviceUrl || ""; $("resourcesLayer").value = c.layers?.resources ?? 0; $("facilitiesLayer").value = c.layers?.facilities ?? 1;
  $("webmapItemId").value = c.map?.webmapItemId || ""; $("mapLongitude").value = c.map?.center?.longitude ?? ""; $("mapLatitude").value = c.map?.center?.latitude ?? ""; $("mapZoom").value = c.map?.zoom ?? 10; $("basemap").value = c.map?.basemap || "dark-gray-vector"; $("importLimitMb").value = Number(c.import?.maxFileBytes || 10000000) / 1_000_000;
  $("importPrivacyNote").textContent = c.import?.privacyNote || $("importPrivacyNote").textContent;
  renderImportSession(readImportSession());
  const values = [["Storage", "localStorage (public configuration only)"], ["Portal", c.portalUrl], ["OAuth mode", c.oauth?.mode], ["OAuth redirect", c.oauth?.redirectUrl], ["Feature service item", c.featureServiceItemId], ["Feature service", c.serviceUrl], ["Resource / facility layers", `${c.layers?.resources} / ${c.layers?.facilities}`], ["Web map item", c.map?.webmapItemId || "Fallback map"], ["Map fallback", `${c.map?.center?.longitude}, ${c.map?.center?.latitude} · zoom ${c.map?.zoom} · ${c.map?.basemap}`], ["Import limit", `${(c.import?.maxFileBytes / 1_000_000).toFixed(1)} MB`], ["Service behavior", "Explicit signed-in resource and facility writes only when each target layer reports the required capability"]];
  $("diagnostics").replaceChildren(...values.flatMap(([term, value]) => { const dt = document.createElement("dt"); const dd = document.createElement("dd"); dt.textContent = term; dd.textContent = value || "Not configured"; return [dt, dd]; }));
}
function values() {
  const colors = {}; for (const [id, key] of [["navy", "navy"], ["background", "background"], ["panel", "panel"], ["panelAlt", "panelAlt"], ["panelStrong", "panelStrong"], ["border", "border"], ["textColor", "text"], ["muted", "muted"], ["faint", "faint"], ["accent", "accent"], ["accentStrong", "accentStrong"], ["blue", "blue"], ["green", "green"], ["red", "red"], ["focus", "focus"]]) colors[key] = $(id).value;
  return {
    portalUrl: $("portalUrl").value.trim(), featureServiceItemId: $("featureServiceItemId").value.trim(), serviceUrl: $("serviceUrl").value.trim().replace(/\/+$/, ""), layers: { resources: Number($("resourcesLayer").value), facilities: Number($("facilitiesLayer").value) },
    oauth: { enabled: true, clientId: $("oauthClientId").value.trim(), mode: "redirect", redirectUrl: $("oauthRedirectUrl").value.trim(), popupCallbackUrl: config.oauth?.popupCallbackUrl || "" },
    map: { webmapItemId: $("webmapItemId").value.trim(), basemap: $("basemap").value.trim(), center: { longitude: Number($("mapLongitude").value), latitude: Number($("mapLatitude").value) }, zoom: Number($("mapZoom").value) }, import: { maxFileBytes: Math.round(Number($("importLimitMb").value) * 1_000_000), privacyNote: config.import?.privacyNote || "" },
    branding: { appName: $("appName").value.trim() || "Asset Management", subtitle: $("subtitle").value.trim() || "Operational inventory preview", logoUrl: draftLogo, colors },
    labels: { inventoryHeading: $("inventoryHeading").value.trim() || "Resources & facilities", resourcesTab: $("resourcesLabel").value.trim() || "Resources", facilitiesTab: $("facilitiesLabel").value.trim() || "Facilities", settingsImport: $("importLabel").value.trim() || "Import local CSV", selectionHeading: $("selectionHeading").value.trim() || "Inventory detail" },
    statusColors: { available: $("statusAvailable").value, limited: $("statusLimited").value, unavailable: $("statusUnavailable").value, unknown: $("statusUnknown").value }, resourceColors: { current: $("resourceCurrent").value, imported: $("resourceImported").value, mocked: $("resourceMocked").value, demo: $("resourceDemo").value },
    operatorDefaults: { showMockedPoints: $("showMockedPoints").checked, compactInventory: $("compactInventory").checked, defaultSourceFilter: $("defaultSourceFilter").value }
  };
}
function helpTopics() {
  return [...document.querySelectorAll(".help-card")].map((card) => ({ title: card.querySelector("summary").textContent.trim(), blocks: [...card.children].filter((node) => node.tagName !== "SUMMARY").flatMap((node) => {
    if (node.matches("h4")) return [{ kind: "subheading", text: node.textContent.trim() }];
    if (node.matches("p")) return [{ kind: node.classList.contains("help-callout") ? "callout" : "paragraph", text: node.textContent.trim() }];
    if (node.matches("ul,ol")) return [...node.children].map((item, index) => ({ kind: "list", text: item.textContent.trim(), ordered: node.tagName === "OL", number: index + 1 }));
    return [];
  }) }));
}
async function downloadHelp() {
  const button = $("downloadHelpPdf"); button.disabled = true; $("helpPdfStatus").textContent = "Building PDF…";
  try {
    const blob = buildHelpPdf(helpTopics(), new Date(), values().branding); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "asset-management-help.pdf"; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); $("helpPdfStatus").textContent = "Branded guide downloaded."; announce("Help PDF downloaded.");
  } catch (error) { $("helpPdfStatus").textContent = "Download failed."; announce(error.message || "Help PDF could not be generated.", "error"); }
  finally { button.disabled = false; }
}

const tabs = ["settings", "configuration", "help"];
for (const name of tabs) $(`${name}Tab`).addEventListener("click", () => setTab(name));
$("settingsMain").querySelector("[role=tablist]").addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const current = tabs.findIndex((name) => $(`${name}Tab`).getAttribute("aria-selected") === "true"); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; setTab(tabs[next], true); });
document.querySelectorAll(".help-nav a").forEach((link) => link.addEventListener("click", () => { const topic = document.querySelector(link.getAttribute("href")); if (topic) topic.open = true; }));
$("previewLogo").addEventListener("click", () => { const url = $("logoUrl").value.trim(); if (url && !/^https:\/\//i.test(url)) { previewLogo("", "Logo URL must use HTTPS."); return; } previewLogo(url, url ? "Logo URL ready to save." : "Default AM mark selected."); });
$("defaultLogo").addEventListener("click", () => { $("logoUrl").value = ""; $("logoUpload").value = ""; previewLogo("", "Default AM mark selected."); });
$("logoUpload").addEventListener("change", (event) => { const file = event.target.files?.[0]; if (!file) return; if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type) || file.size > 307200) { event.target.value = ""; previewLogo("", "Choose PNG, JPEG, GIF, or WebP no larger than 300 KB."); return; } const reader = new FileReader(); reader.addEventListener("load", () => { $("logoUrl").value = ""; previewLogo(String(reader.result), "Uploaded logo ready to save."); }); reader.readAsDataURL(file); });
$("settingsCsvFile").addEventListener("change", inspectSelectedFile);
$("resetAutomaticMappings").addEventListener("click", applyAutomaticMappings);
$("settingsImportForm").addEventListener("submit", stageImport);
$("clearStagedImport").addEventListener("click", () => { clearImportSession(); $("settingsCsvFile").value = ""; fileReadSequence += 1; clearMappingUi(); renderImportSession(null); announce("Staged import cleared from this browser session."); });
$("save").addEventListener("click", () => { try { const overrides = values(); validateConfig(mergeConfig(config, overrides)); saveConfigOverrides(overrides); announce("Settings saved. Reloading…"); setTimeout(() => location.reload(), 500); } catch (error) { announce(error.message, "error"); } });
$("reset").addEventListener("click", () => { clearConfigOverrides(); announce("Browser overrides removed. Reloading…"); setTimeout(() => location.reload(), 400); });
$("downloadHelpPdf").addEventListener("click", downloadHelp);

(async () => { try { populate(await loadConfig()); } catch (error) { announce(error.message, "error"); } })();
