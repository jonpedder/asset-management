import { assignLocations } from "./location.js";
import { readImportSession } from "./import-session.js";
import { initializeAuth, probeAnonymousAccess, signIn, signOut } from "./auth.js";
import { initializeMap, addServiceLayers, displayImported, displayDemo, clearDemo, setMockedVisible, focusRecord } from "./map.js";
import { queryAllFeatures, resourceFromFeature, facilityFromFeature } from "./service-data.js";
import { DEMO_RESOURCES, DEMO_FACILITIES } from "./demo.js";
import { escapeHtml, formatCurrencyRange, formatNumber } from "./format.js";
import { loadConfig } from "./config.js";
import { applyPresentation } from "./presentation.js";

const state = {
  config: null,
  resources: [],
  facilities: [],
  imported: [],
  stagedImport: null,
  demoActive: false,
  serviceAvailable: false,
  signedIn: false,
  oauthConfigured: false,
  locationSummary: { resourceMatches: 0, facilityMatches: 0, mocked: 0, total: 0, coveragePercent: 0 },
  selectedId: null,
  inventoryType: "resources"
};

const byId = (id) => document.getElementById(id);
const elements = {};

function cacheElements() {
  ["systemStatus", "authStatus", "serviceStatus", "signInButton", "signOutButton", "demoButton", "resourceSearch", "sourceFilter", "resourceRows", "facilityRows", "inventoryCount", "facilityCount", "resourceTab", "facilityTab", "resourcePanel", "facilityPanel", "detail", "verifiedRecords", "verifiedQuantity", "importedRecords", "importedQuantity", "coverageMetric", "mockedToggle", "locationSummary", "lastUpdated", "mapMessage", "toastRegion"].forEach((id) => { elements[id] = byId(id); });
}

function setStatus(message, tone = "neutral") {
  elements.systemStatus.textContent = message;
  elements.systemStatus.dataset.tone = tone;
}

function toast(message, tone = "info") {
  const node = document.createElement("div");
  node.className = `toast ${tone}`;
  node.setAttribute("role", tone === "error" ? "alert" : "status");
  node.textContent = message;
  elements.toastRegion.append(node);
  window.setTimeout(() => node.remove(), 5500);
}

function currentResources() {
  return state.demoActive ? DEMO_RESOURCES : state.resources;
}

function currentFacilities() {
  return state.demoActive ? DEMO_FACILITIES : state.facilities;
}

function allResourceRecords() {
  return [...currentResources(), ...state.imported];
}

function sumQuantity(records) {
  return records.reduce((sum, record) => sum + (Number(record.quantity?.estimate) || 0), 0);
}

function sumQuantityBounds(records) {
  return records.reduce((totals, record) => {
    const min = Number(record.quantity?.min);
    const max = Number(record.quantity?.max);
    if (Number.isFinite(min)) totals.min += min;
    if (Number.isFinite(max)) totals.max += max;
    return totals;
  }, { min: 0, max: 0 });
}

function updateMetrics() {
  const serviceRecords = state.demoActive ? [] : state.resources;
  const importedBounds = sumQuantityBounds(state.imported);
  elements.verifiedRecords.textContent = formatNumber(serviceRecords.length);
  elements.verifiedQuantity.textContent = formatNumber(sumQuantity(serviceRecords));
  elements.importedRecords.textContent = formatNumber(state.imported.length);
  elements.importedQuantity.textContent = importedBounds.min === importedBounds.max
    ? formatNumber(importedBounds.min)
    : `${formatNumber(importedBounds.min)}–${formatNumber(importedBounds.max)}`;
  const currentCoverage = serviceRecords.length
    ? Math.round(serviceRecords.filter((record) => record.geometry).length / serviceRecords.length * 100)
    : 0;
  const coverage = state.imported.length ? state.locationSummary.coveragePercent : currentCoverage;
  elements.coverageMetric.textContent = `${coverage}%`;
  elements.locationSummary.textContent = state.imported.length
    ? `${state.locationSummary.resourceMatches} resource matches · ${state.locationSummary.facilityMatches} facility matches · ${state.locationSummary.mocked} mocked county points`
    : "Stage a CSV in Settings to run location validation.";
}

function sourceLabel(record) {
  if (record.sourceType === "service") return '<span class="source-pill source-current">CURRENT</span>';
  if (record.sourceType === "demo") return '<span class="source-pill source-demo">INVENTED DEMO</span>';
  if (record.isMockLocation) return '<span class="source-pill source-mock">IMPORTED · MOCKED</span>';
  return '<span class="source-pill source-import">IMPORTED · MATCHED</span>';
}

function renderResources() {
  const search = elements.resourceSearch.value.trim().toLowerCase();
  const source = elements.sourceFilter.value;
  const records = allResourceRecords().filter((record) => {
    const haystack = [record.assetType, record.department, record.category, record.status, record.source].join(" ").toLowerCase();
    return (!search || haystack.includes(search)) && (!source || record.sourceType === source);
  });
  elements.inventoryCount.textContent = records.length;
  if (!records.length) {
    elements.resourceRows.innerHTML = '<tr><td colspan="6" class="empty-cell">No inventory records match the current filters.</td></tr>';
    return;
  }
  elements.resourceRows.innerHTML = records.map((record) => `
    <tr data-record-id="${escapeHtml(record.id)}" tabindex="0" aria-label="Open ${escapeHtml(record.assetType)} details">
      <td><strong>${escapeHtml(record.assetType)}</strong><span class="mobile-meta">${escapeHtml(record.department || "No department")}</span></td>
      <td>${escapeHtml(record.department || "—")}</td>
      <td>${escapeHtml(record.category || "—")}</td>
      <td>${escapeHtml(record.quantity?.raw || "—")}</td>
      <td><span class="status status-${escapeHtml((record.status || "unknown").toLowerCase().replace(/\s+/g, "-"))}">${escapeHtml(record.status || "Unknown")}</span></td>
      <td>${sourceLabel(record)}</td>
    </tr>`).join("");
}

function renderFacilities() {
  const records = currentFacilities();
  elements.facilityCount.textContent = records.length;
  elements.facilityRows.innerHTML = records.length ? records.map((record) => `
    <tr data-record-id="${escapeHtml(record.id)}" tabindex="0" aria-label="Open ${escapeHtml(record.name)} details">
      <td><strong>${escapeHtml(record.name)}</strong></td><td>${escapeHtml(record.type)}</td><td>${escapeHtml(record.status)}</td><td>${sourceLabel(record)}</td>
    </tr>`).join("") : '<tr><td colspan="4" class="empty-cell">No facilities are loaded.</td></tr>';
}

function recordById(id) {
  return [...allResourceRecords(), ...currentFacilities()].find((record) => record.id === id);
}

function showDetail(id) {
  const record = recordById(id);
  if (!record) return;
  state.selectedId = id;
  const isFacility = Boolean(record.name && !record.assetType);
  const attributes = Object.entries(record.attributes || {}).filter(([, value]) => value != null && String(value).trim()).slice(0, 12);
  elements.detail.innerHTML = `
    <div class="detail-hero">
      ${sourceLabel(record)}
      <h2>${escapeHtml(record.assetType || record.name)}</h2>
      <p>${escapeHtml(isFacility ? record.type : record.category || "Uncategorized")}</p>
    </div>
    <dl class="detail-grid">
      <div><dt>Source</dt><dd>${escapeHtml(record.source)}</dd></div>
      <div><dt>Location</dt><dd>${escapeHtml(record.locationMethod || (record.geometry ? "Service geometry" : "No geometry"))}${record.isMockLocation ? " (mock)" : ""}</dd></div>
      ${isFacility ? `
        <div><dt>Status</dt><dd>${escapeHtml(record.status)}</dd></div>
        <div><dt>Department</dt><dd>${escapeHtml(record.department || "Not provided")}</dd></div>` : `
        <div><dt>Department</dt><dd>${escapeHtml(record.department || "Not provided")}</dd></div>
        <div><dt>Quantity</dt><dd>${escapeHtml(record.quantity?.raw || "Not provided")} ${record.quantity?.min !== record.quantity?.max ? "(range)" : ""}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(record.status)}</dd></div>
        <div><dt>Priority</dt><dd>${escapeHtml(record.priority || "Unspecified")}</dd></div>
        <div><dt>Operator</dt><dd>${escapeHtml(record.operator || "Unknown")}</dd></div>
        <div><dt>Unit cost</dt><dd>${escapeHtml(formatCurrencyRange(record.unitCost))}</dd></div>
        <div class="detail-wide"><dt>EOC role / use</dt><dd>${escapeHtml(record.eocRole || "Not provided")}</dd></div>
        <div class="detail-wide"><dt>Gap</dt><dd>${escapeHtml(record.gapDescription || "None documented")}</dd></div>
        <div class="detail-wide"><dt>Notes / source</dt><dd>${escapeHtml(record.notes || "Not provided")}</dd></div>`}
      ${attributes.length ? `<div class="detail-wide"><dt>Service attributes</dt><dd><details><summary>Show ${attributes.length} fields</summary><dl class="attribute-list">${attributes.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></details></dd></div>` : ""}
    </dl>`;
  focusRecord(record);
}

function setInventoryType(type) {
  state.inventoryType = type;
  const resources = type === "resources";
  elements.resourceTab.setAttribute("aria-selected", resources);
  elements.facilityTab.setAttribute("aria-selected", !resources);
  elements.resourceTab.classList.toggle("active", resources);
  elements.facilityTab.classList.toggle("active", !resources);
  elements.resourcePanel.hidden = !resources;
  elements.facilityPanel.hidden = resources;
}

function renderAll() {
  renderResources();
  renderFacilities();
  updateMetrics();
}

function consumeStagedImport() {
  if (!state.stagedImport?.records?.length) {
    state.imported = [];
    displayImported([]);
    return;
  }
  const { records, summary } = assignLocations(
    state.stagedImport.records,
    state.resources,
    state.facilities,
    state.config.map.center
  );
  state.imported = records;
  state.locationSummary = summary;
  displayImported(records);
  if (records.length) elements.mapMessage.hidden = true;
}

async function loadOperationalData() {
  setStatus("Loading operational data", "busy");
  elements.mapMessage.hidden = false;
  elements.mapMessage.innerHTML = "<strong>Loading operational layers…</strong><span>Resources and Facilities are read-only.</span>";
  try {
    const { resourceLayer, facilityLayer } = await addServiceLayers(state.config);
    const [resourceFeatures, facilityFeatures] = await Promise.all([
      queryAllFeatures(resourceLayer),
      queryAllFeatures(facilityLayer)
    ]);
    state.resources = resourceFeatures.map(resourceFromFeature);
    state.facilities = facilityFeatures.map(facilityFromFeature);
    state.serviceAvailable = true;
    state.demoActive = false;
    clearDemo();
    elements.demoButton.hidden = true;
    elements.mapMessage.hidden = true;
    elements.serviceStatus.textContent = `Connected · ${state.resources.length} resources · ${state.facilities.length} facilities`;
    elements.lastUpdated.textContent = `Loaded ${new Date().toLocaleString()}`;
    setStatus("Operational", "ok");
    consumeStagedImport();
    renderAll();
  } catch (error) {
    state.serviceAvailable = false;
    state.resources = [];
    state.facilities = [];
    elements.serviceStatus.textContent = `Service unavailable: ${error.message}`;
    elements.demoButton.hidden = false;
    elements.mapMessage.hidden = false;
    elements.mapMessage.innerHTML = "<strong>Operational service unavailable</strong><span>Sign in if authorized, or open invented demo mode. Staged CSV records still use deterministic mocked points.</span>";
    setStatus("Service access needed", "warn");
    consumeStagedImport();
    renderAll();
  }
}

async function attemptInitialAccess() {
  if (state.signedIn) {
    await loadOperationalData();
    return;
  }
  const probe = await probeAnonymousAccess(`${state.config.serviceUrl}/${state.config.layers.resources}`);
  if (probe.accessible) {
    elements.authStatus.textContent = "Anonymous access";
    await loadOperationalData();
  } else {
    elements.authStatus.textContent = state.oauthConfigured ? "Not signed in · OAuth available" : "Not signed in · OAuth not configured";
    elements.serviceStatus.textContent = `Anonymous attempt did not load the private service (${probe.reason}).`;
    elements.demoButton.hidden = false;
    elements.mapMessage.hidden = false;
    elements.mapMessage.innerHTML = "<strong>Sign-in may be required</strong><span>The anonymous attempt could not access the service. Staged CSV records still use deterministic mocked points.</span>";
    setStatus("Authentication available", "warn");
    consumeStagedImport();
  }
}

function bindEvents() {
  elements.signInButton.addEventListener("click", async () => {
    elements.signInButton.disabled = true;
    try {
      await signIn();
      state.signedIn = true;
      elements.authStatus.textContent = "Signed in";
      elements.signOutButton.hidden = false;
      await loadOperationalData();
    } catch (error) {
      toast(`Sign-in failed: ${error.message}`, "error");
    } finally {
      elements.signInButton.disabled = false;
    }
  });
  elements.signOutButton.addEventListener("click", () => {
    signOut();
    window.location.reload();
  });
  elements.demoButton.addEventListener("click", () => {
    if (state.serviceAvailable) return;
    state.demoActive = true;
    displayDemo(DEMO_RESOURCES, DEMO_FACILITIES);
    elements.mapMessage.hidden = true;
    elements.serviceStatus.textContent = "Invented demo mode — not operational data";
    setStatus("Invented demo", "warn");
    renderAll();
  });
  elements.resourceSearch.addEventListener("input", renderResources);
  elements.sourceFilter.addEventListener("change", renderResources);
  elements.mockedToggle.addEventListener("change", () => setMockedVisible(elements.mockedToggle.checked));
  elements.resourceTab.addEventListener("click", () => setInventoryType("resources"));
  elements.facilityTab.addEventListener("click", () => setInventoryType("facilities"));
  const activateRow = (event) => {
    const row = event.target.closest("tr[data-record-id]");
    if (!row || (event.type === "keydown" && !["Enter", " "].includes(event.key))) return;
    if (event.type === "keydown") event.preventDefault();
    showDetail(row.dataset.recordId);
  };
  elements.resourceRows.addEventListener("click", activateRow);
  elements.resourceRows.addEventListener("keydown", activateRow);
  elements.facilityRows.addEventListener("click", activateRow);
  elements.facilityRows.addEventListener("keydown", activateRow);
}

async function main() {
  cacheElements();
  bindEvents();
  try {
    state.config = await loadConfig("./config/app.json");
    applyPresentation(state.config);
    byId("serviceItemId").textContent = state.config.featureServiceItemId;
    state.stagedImport = readImportSession();
    elements.sourceFilter.value = state.config.operatorDefaults?.defaultSourceFilter || "";
    elements.mockedToggle.checked = state.config.operatorDefaults?.showMockedPoints !== false;
    await initializeMap(state.config, showDetail);
    setMockedVisible(elements.mockedToggle.checked);
    const auth = await initializeAuth(state.config);
    state.signedIn = auth.signedIn;
    state.oauthConfigured = auth.oauthConfigured;
    elements.authStatus.textContent = auth.signedIn ? "Signed in session found" : auth.oauthConfigured ? "Not signed in · OAuth configured" : "OAuth not configured";
    elements.signInButton.disabled = !auth.oauthConfigured;
    elements.signOutButton.hidden = !auth.signedIn;
    window.__app = {
      version: "1.0.0-mvp",
      getState: () => ({ ...state, resources: [...state.resources], facilities: [...state.facilities], imported: [...state.imported] }),
      loadOperationalData,
      showDetail,
      setMockedVisible
    };
    await attemptInitialAccess();
    renderAll();
  } catch (error) {
    setStatus("Initialization failed", "error");
    elements.serviceStatus.textContent = error.message;
    elements.mapMessage.hidden = false;
    elements.mapMessage.innerHTML = `<strong>Application could not initialize</strong><span>${escapeHtml(error.message)}</span>`;
    console.error("Application initialization failed", error);
  }
}

main();
