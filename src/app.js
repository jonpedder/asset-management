import { assignLocations } from "./location.js";
import { readImportSession, updateImportSessionRecord } from "./import-session.js";
import { additionalEditableFields, buildServiceUpdate, editorValuesFromRecord, extractFacilityAddress, inferFieldBindings, normalizedRecordPatch, serviceEditGate } from "./asset-editing.js";
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
  inventoryType: "resources",
  resourceLayer: null,
  facilityLayer: null,
  editGeometry: null,
  editLocationMode: "current",
  geocodePreview: null
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
    <div class="detail-hero">${sourceLabel(record)}<h2>${escapeHtml(record.assetType || record.name)}</h2><p>${escapeHtml(isFacility ? record.type : record.category || "Uncategorized")}</p>
      ${isFacility ? "" : '<button class="btn detail-edit-action" id="editAssetButton" type="button">Edit asset</button>'}</div>
    <dl class="detail-grid">
      <div><dt>Source</dt><dd>${escapeHtml(record.source)}</dd></div>
      <div><dt>Location</dt><dd>${escapeHtml(record.locationMethod || (record.geometry ? "Service geometry" : "No geometry"))}${record.isMockLocation ? " (mock)" : ""}</dd></div>
      ${isFacility ? `<div><dt>Status</dt><dd>${escapeHtml(record.status)}</dd></div><div><dt>Department</dt><dd>${escapeHtml(record.department || "Not provided")}</dd></div>` : `
        <div><dt>Department</dt><dd>${escapeHtml(record.department || "Not provided")}</dd></div><div><dt>Quantity</dt><dd>${escapeHtml(record.quantity?.raw || "Not provided")}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(record.status)}</dd></div><div><dt>Priority</dt><dd>${escapeHtml(record.priority || "Unspecified")}</dd></div>
        <div><dt>Operator</dt><dd>${escapeHtml(record.operator || "Unknown")}</dd></div><div><dt>Unit cost</dt><dd>${escapeHtml(formatCurrencyRange(record.unitCost))}</dd></div>
        <div class="detail-wide"><dt>EOC role / use</dt><dd>${escapeHtml(record.eocRole || "Not provided")}</dd></div>
        <div class="detail-wide"><dt>Address</dt><dd>${escapeHtml([record.locationName, record.address, record.city, record.state, record.zip].filter(Boolean).join(", ") || "Not provided")}</dd></div>
        <div class="detail-wide"><dt>Gap</dt><dd>${escapeHtml(record.gapDescription || "None documented")}</dd></div><div class="detail-wide"><dt>Notes / source</dt><dd>${escapeHtml(record.notes || "Not provided")}</dd></div>`}
      ${attributes.length ? `<div class="detail-wide"><dt>Service attributes</dt><dd><details><summary>Show ${attributes.length} fields</summary><dl class="attribute-list">${attributes.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></details></dd></div>` : ""}
    </dl>`;
  focusRecord(record);
}

const EDIT_FIELDS = [
  ["assetType", "Asset type"], ["department", "Department"], ["category", "Category"], ["quantityRaw", "Quantity (raw value)"],
  ["availability", "Availability"], ["eocRole", "EOC role / use"], ["operator", "Operator required"], ["status", "Status"],
  ["gapDescription", "Gap description"], ["priority", "Procurement priority"], ["unitCostRaw", "Estimated unit cost (raw value)"], ["notes", "Notes / source"]
];
function fieldControl(field, value, additional = false) {
  const id = `${additional ? "additional" : "edit"}-${additional ? field.name : field.key}`;
  const coded = field.domain?.codedValues;
  if (Array.isArray(coded)) return `<label><span>${escapeHtml(field.label || field.alias || field.name)}${field.nullable === false ? " *" : ""}${field.disabled ? " (not stored by this layer)" : ""}</span><select id="${escapeHtml(id)}" ${additional ? `data-additional-field="${escapeHtml(field.name)}"` : `name="${escapeHtml(field.key)}"`} ${field.nullable === false ? "required" : ""} ${field.disabled ? "disabled" : ""}><option value="">${field.nullable === false ? "Choose a value" : "No value"}</option>${coded.map((entry) => `<option value="${escapeHtml(entry.code)}" ${String(entry.code) === String(value) ? "selected" : ""}>${escapeHtml(entry.name)}</option>`).join("")}</select></label>`;
  return `<label><span>${escapeHtml(field.label || field.alias || field.name)}${field.nullable === false ? " *" : ""}${field.disabled ? " (not stored by this layer)" : ""}</span><input id="${escapeHtml(id)}" ${additional ? `data-additional-field="${escapeHtml(field.name)}"` : `name="${escapeHtml(field.key)}"`} value="${escapeHtml(value ?? "")}" ${field.length ? `maxlength="${field.length}"` : ""} ${field.nullable === false ? "required" : ""} ${field.disabled ? "disabled" : ""}></label>`;
}
function showAssetEditor() {
  const record = recordById(state.selectedId);
  if (!record || !record.assetType) return;
  const values = editorValuesFromRecord(record);
  const isService = record.sourceType === "service";
  const gate = isService ? serviceEditGate({ signedIn: state.signedIn, layer: state.resourceLayer, record }) : record.sourceType === "import"
    ? { allowed: true, reason: "Save changes updates only this tab's strict import session." }
    : { allowed: false, reason: "Invented demo records cannot be persisted." };
  const bindings = isService ? inferFieldBindings(state.resourceLayer?.fields || []) : {};
  const additional = isService ? additionalEditableFields(state.resourceLayer?.fields || [], bindings, state.resourceLayer?.objectIdField) : [];
  const facilities = currentFacilities();
  state.editGeometry = record.geometry || null; state.geocodePreview = null; state.editLocationMode = "current";
  elements.detail.innerHTML = `<form id="assetEditForm" class="asset-edit-form" novalidate>
    <div class="editor-heading"><div><p class="eyebrow">Editing</p><h2>${escapeHtml(record.assetType)}</h2></div><button type="button" class="btn btn-quiet" id="cancelAssetEdit">Cancel</button></div>
    <p class="edit-boundary">${escapeHtml(gate.reason)} Facilities are reference-only and are never edited.</p>
    <fieldset><legend>Inventory attributes</legend><div class="form-grid">${EDIT_FIELDS.map(([key, label]) => { const schema = isService ? state.resourceLayer.fields.find((field) => field.name === bindings[key]) : null; return fieldControl({ ...(schema || {}), key, label, disabled: isService && (!schema || schema.editable === false) }, values[key]); }).join("")}</div></fieldset>
    <fieldset><legend>Location</legend><div class="location-choices" role="radiogroup" aria-label="Location choice">
      <label><input type="radio" name="locationMode" value="current" checked> Retain current / selected geometry</label>
      <label><input type="radio" name="locationMode" value="facility"> Existing facility</label>
      <label><input type="radio" name="locationMode" value="address"> Given address</label></div>
      <label id="facilityChoice" hidden><span>Existing facility</span><select id="editFacility"><option value="">Choose a loaded facility</option>${facilities.map((facility) => `<option value="${escapeHtml(facility.id)}">${escapeHtml(facility.name)}</option>`).join("")}</select></label>
      <div class="form-grid location-fields">
        ${fieldControl({ key: "locationName", label: "Location name" }, values.locationName)}${fieldControl({ key: "address", label: "Address" }, values.address)}
        ${fieldControl({ key: "city", label: "City" }, values.city)}${fieldControl({ key: "state", label: "State" }, values.state)}${fieldControl({ key: "zip", label: "ZIP" }, values.zip)}
      </div><button id="locateAddress" class="btn btn-quiet" type="button" hidden>Locate address</button><p id="editLocationStatus" class="form-status" role="status">Current geometry will be retained.</p>
    </fieldset>
    ${additional.length ? `<details class="additional-attributes"><summary>Additional service attributes (${additional.length})</summary><div class="form-grid">${additional.map((field) => fieldControl(field, record.attributes?.[field.name], true)).join("")}</div></details>` : ""}
    <div id="editValidation" class="form-status" role="alert"></div><div class="editor-actions"><button class="btn" type="submit" ${gate.allowed ? "" : "disabled"}>Save changes</button><button class="btn btn-quiet" type="button" id="cancelAssetEdit2">Cancel</button></div>
  </form>`;
}
function formValues(form) { return Object.fromEntries([...form.elements].filter((element) => element.name && element.name !== "locationMode").map((element) => [element.name, element.value])); }
function setEditorStatus(message, tone = "") { const node = byId("editValidation"); if (node) { node.textContent = message; node.dataset.tone = tone; } }
async function locatorUrl() {
  if (state.config.geocoderUrl) return state.config.geocoderUrl;
  const Portal = await $arcgis.import("@arcgis/core/portal/Portal.js");
  const portal = new Portal({ url: state.config.portalUrl }); await portal.load();
  const url = portal.helperServices?.geocode?.[0]?.url;
  if (!url || !/^https:\/\//i.test(url)) throw new Error("No safe HTTPS portal helper geocoder is configured.");
  return url;
}
async function geocodeEditor(forStorage = false) {
  const form = byId("assetEditForm"); const values = formValues(form);
  if (![values.address, values.city, values.state, values.zip].some((value) => value.trim())) throw new Error("Enter an address, city, state, or ZIP before locating.");
  const locator = await $arcgis.import("@arcgis/core/rest/locator.js");
  const results = await locator.addressToLocations(await locatorUrl(), { address: { address: values.address, city: values.city, region: values.state, postal: values.zip }, maxLocations: 5, outFields: ["Match_addr", "Addr_type"], forStorage });
  const best = [...(results || [])].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  if (!best?.location) throw new Error("No address match was found. Geometry was not changed.");
  if (Number(best.score || 0) < 80) throw new Error(`Best address match confidence was ${best.score || 0}/100. Refine the address; geometry was not changed.`);
  return best;
}
async function saveAssetEdit(event) {
  event.preventDefault();
  const record = recordById(state.selectedId); const form = event.target; const values = formValues(form);
  if (!form.reportValidity()) return;
  const submit = form.querySelector('[type="submit"]'); submit.disabled = true; setEditorStatus("Validating changes…");
  try {
    let geometry = state.editGeometry; let locationMethod = record.locationMethod; let isMockLocation = record.isMockLocation;
    if (state.editLocationMode === "facility") {
      const facility = currentFacilities().find((item) => item.id === byId("editFacility").value);
      if (!facility?.geometry) throw new Error("Choose a loaded facility with geometry.");
      const address = extractFacilityAddress(facility); Object.assign(values, { locationName: address.name, address: address.address, city: address.city, state: address.state, zip: address.zip, facility: address.name });
      geometry = address.geometry; locationMethod = "Existing facility selected"; isMockLocation = false;
    } else if (state.editLocationMode === "address") {
      if (!state.geocodePreview) throw new Error("Use Locate address and review a confident match before saving.");
      setEditorStatus("Confirming address for persisted use…");
      const storedMatch = await geocodeEditor(true); geometry = storedMatch.location; locationMethod = "Geocoded address"; isMockLocation = false;
    }
    if (record.sourceType === "import") {
      const patch = { ...normalizedRecordPatch(values), geometry, locationMethod, isMockLocation };
      state.stagedImport = updateImportSessionRecord(record.id, patch); consumeStagedImport(); renderAll(); showDetail(record.id);
      toast("Imported asset updated in this browser session."); return;
    }
    const gate = serviceEditGate({ signedIn: state.signedIn, layer: state.resourceLayer, record }); if (!gate.allowed) throw new Error(gate.reason);
    const bindings = inferFieldBindings(state.resourceLayer.fields || []);
    const additionalValues = Object.fromEntries([...form.querySelectorAll("[data-additional-field]")].map((input) => [input.dataset.additionalField, input.value]));
    const update = buildServiceUpdate(record, values, state.resourceLayer, bindings, additionalValues, geometry);
    if (update.errors.length) throw new Error(update.errors.join(" "));
    setEditorStatus("Saving authorized feature update…");
    const result = await state.resourceLayer.applyEdits({ updateFeatures: [update.feature] });
    const editResult = result.updateFeatureResults?.[0]; if (!editResult || editResult.error) throw new Error(editResult?.error?.message || "The service did not confirm the update.");
    state.resourceLayer.refresh();
    const refreshed = await state.resourceLayer.queryFeatures({ objectIds: [record.objectId], outFields: ["*"], returnGeometry: true, outSpatialReference: { wkid: 4326 } });
    if (refreshed.features?.[0]) state.resources[state.resources.findIndex((item) => item.id === record.id)] = resourceFromFeature(refreshed.features[0], 0, state.resourceLayer.fields, state.resourceLayer.objectIdField);
    renderAll(); showDetail(record.id); toast("Service asset updated successfully.");
  } catch (error) { setEditorStatus(error.message, "error"); submit.disabled = false; }
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
  elements.mapMessage.innerHTML = "<strong>Loading operational layers…</strong><span>Resources may be edited only through an explicit authorized Save; facilities remain reference-only.</span>";
  try {
    const { resourceLayer, facilityLayer } = await addServiceLayers(state.config);
    const [resourceFeatures, facilityFeatures] = await Promise.all([
      queryAllFeatures(resourceLayer),
      queryAllFeatures(facilityLayer)
    ]);
    state.resourceLayer = resourceLayer;
    state.facilityLayer = facilityLayer;
    state.resources = resourceFeatures.map((feature, index) => resourceFromFeature(feature, index, resourceLayer.fields, resourceLayer.objectIdField));
    state.facilities = facilityFeatures.map((feature, index) => facilityFromFeature(feature, index, facilityLayer.objectIdField, facilityLayer.fields));
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
    state.resourceLayer = null;
    state.facilityLayer = null;
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
  elements.detail.addEventListener("click", async (event) => {
    if (event.target.closest("#editAssetButton")) showAssetEditor();
    if (event.target.closest("#cancelAssetEdit, #cancelAssetEdit2")) showDetail(state.selectedId);
    if (event.target.closest("#locateAddress")) {
      const button = event.target.closest("#locateAddress"); button.disabled = true; byId("editLocationStatus").textContent = "Locating address for preview…";
      try { const match = await geocodeEditor(false); state.geocodePreview = match; state.editGeometry = match.location; byId("editLocationStatus").textContent = `Confident match (${match.score}/100): ${match.address || match.attributes?.Match_addr || "address located"}. Geometry will move only if Save changes succeeds.`; }
      catch (error) { state.geocodePreview = null; byId("editLocationStatus").textContent = error.message; }
      finally { button.disabled = false; }
    }
  });
  elements.detail.addEventListener("change", (event) => {
    if (event.target.name === "locationMode") {
      state.editLocationMode = event.target.value; state.geocodePreview = null;
      byId("facilityChoice").hidden = state.editLocationMode !== "facility"; byId("locateAddress").hidden = state.editLocationMode !== "address";
      byId("editLocationStatus").textContent = state.editLocationMode === "current" ? "Current geometry will be retained." : state.editLocationMode === "facility" ? "Choose a loaded facility to copy its address and geometry." : "Enter the address and use Locate address. No geometry changes until Save succeeds.";
    }
    if (event.target.id === "editFacility") {
      const facility = currentFacilities().find((item) => item.id === event.target.value); if (!facility) return;
      const address = extractFacilityAddress(facility); for (const [key, value] of Object.entries({ locationName: address.name, address: address.address, city: address.city, state: address.state, zip: address.zip })) { const input = byId(`edit-${key}`); if (input) input.value = value; }
      state.editGeometry = address.geometry; byId("editLocationStatus").textContent = address.geometry ? "Facility address and geometry are ready. Save to apply them to this asset." : "Facility address was copied, but the facility has no usable geometry.";
    }
    if (state.editLocationMode === "address" && ["address", "city", "state", "zip"].includes(event.target.name)) { state.geocodePreview = null; byId("editLocationStatus").textContent = "Address changed. Locate it again before saving."; }
  });
  elements.detail.addEventListener("submit", (event) => { if (event.target.id === "assetEditForm") saveAssetEdit(event); });
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
