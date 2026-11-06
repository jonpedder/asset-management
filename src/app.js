import { assignLocations } from "./location.js";
import { readImportSession, updateImportSessionRecord, updateImportSessionRecords, validateImportSessionRecordUpdates } from "./import-session.js";
import { additionalEditableFields, buildServiceUpdate, editorValuesFromRecord, extractFacilityAddress, inferFieldBindings, normalizedRecordPatch, serviceEditGate } from "./asset-editing.js";
import { cleanSelectedIds, facilityFilterOptions, filterResourceRecords, planBulkFacilityAssignment, summarizeServiceUpdateResults } from "./inventory-operations.js";
import { getAuthenticatedUser, initializeAuth, probeAnonymousAccess, signIn, signOut } from "./auth.js?v=20261106-3";
import { initializeMap, addServiceLayers, displayImported, displayDemo, clearDemo, setMockedVisible, focusRecord, startPointSelection, cancelPointSelection, setPlacementPreview, clearPlacementPreview, restoreListView, captureResourceReportMap } from "./map.js?v=20261106-15";
import { queryAllFeatures, resourceFromFeature, facilityFromFeature } from "./service-data.js";
import { FACILITY_FIELDS, additionalFacilityFields, buildFacilityFeature, deleteWarningModel, facilityEditGate, facilityValuesFromRecord, geometryCompatibility, inferFacilityBindings, selectConfidentAddressMatch } from "./facility-editing.js";
import { DEMO_RESOURCES, DEMO_FACILITIES } from "./demo.js";
import { escapeHtml, formatCurrencyRange, formatNumber } from "./format.js";
import { loadConfig } from "./config.js?v=20261106-3";
import { applyPresentation } from "./presentation.js";
import { resourceSymbolFor } from "./resource-symbols.js?v=20261106-3";
import { FACILITY_SYMBOL_URL } from "./facility-symbols.js?v=20261106-2";
import { sortRows } from "./table-sort.js?v=20261106-1";
import { initializeInventoryResizer } from "./panel-resize.js?v=20261106-3";
import { availableResourcesReport, isResourceAvailable, reportSummary, resourceFacilityName, resourcesAtFacilitiesReport } from "./report-data.js?v=20261106-1";
import { buildInventoryReportPdf, loadPdfImage } from "./report-pdf.js?v=20261106-1";

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
  user: null,
  locationSummary: { resourceMatches: 0, facilityMatches: 0, mocked: 0, total: 0, coveragePercent: 0 },
  selectedId: null,
  inventoryType: "resources",
  resourceLayer: null,
  facilityLayer: null,
  editGeometry: null,
  editLocationMode: "current",
  geocodePreview: null,
  facilityEditMode: null,
  facilityEditGeometry: null,
  facilityLocationMode: "retain",
  facilityGeocodePreview: null,
  pendingDeleteFacilityId: null,
  selectedResourceIds: new Set(),
  visibleResourceIds: [],
  resourceSort: { key: null, direction: "asc" },
  facilitySort: { key: null, direction: "asc" }
};

const byId = (id) => document.getElementById(id);
const elements = {};

function cacheElements() {
  ["workspace", "inventoryResizeHandle", "systemStatus", "authStatus", "serviceStatus", "sessionChip", "sessionDot", "sessionUser", "sessionState", "signInButton", "signOutButton", "demoButton", "reportType", "exportReportButton", "resourceSearch", "sourceFilter", "facilityFilter", "cityFilter", "zipFilter", "clearFilters", "activeFilters", "bulkFacility", "bulkPreview", "bulkStatus", "applyBulkFacility", "bulkToggle", "bulkContent", "resetSortOrder", "selectedCount", "selectAllVisible", "resourceRows", "facilityRows", "addFacilityButton", "inventoryCount", "resourceCount", "facilityCount", "resourceTab", "facilityTab", "resourcePanel", "facilityPanel", "detailPanel", "detailClose", "detail", "verifiedRecords", "verifiedQuantity", "importedRecords", "importedQuantity", "coverageMetric", "mockedToggle", "lastUpdated", "mapMessage", "toastRegion", "removeFacilityDialog", "removeFacilityMessage", "confirmRemoveFacility", "cancelRemoveFacility"].forEach((id) => { elements[id] = byId(id); });
}

function setStatus(message, tone = "neutral") {
  elements.systemStatus.textContent = message;
  elements.systemStatus.dataset.tone = tone;
}

function presentSession(user = state.user) {
  const authenticated = Boolean(state.signedIn);
  const username = user?.username || user?.fullName || "Signed-in user";
  state.user = authenticated ? user : null;
  elements.sessionChip.hidden = !authenticated;
  elements.sessionDot.classList.toggle("online", authenticated);
  elements.sessionUser.textContent = authenticated ? username : "Not signed in";
  elements.sessionState.textContent = authenticated ? "Authenticated" : "Authentication required";
  elements.sessionChip.title = authenticated && user?.fullName && user.fullName !== username ? `${user.fullName} · Authenticated` : authenticated ? `${username} · Authenticated` : "Not signed in";
  elements.signInButton.hidden = authenticated;
  elements.signOutButton.hidden = !authenticated;
  if (authenticated) elements.authStatus.textContent = `Authenticated · ${username}`;
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
}

function sourceLabel(record) {
  if (record.sourceType === "service") return '<span class="source-pill source-current">CURRENT</span>';
  if (record.sourceType === "demo") return '<span class="source-pill source-demo">INVENTED DEMO</span>';
  if (record.isMockLocation) return '<span class="source-pill source-mock">IMPORTED · MOCKED</span>';
  return '<span class="source-pill source-import">IMPORTED · MATCHED</span>';
}

function currentResourceFilters() {
  return { search: elements.resourceSearch.value, source: elements.sourceFilter.value, facility: elements.facilityFilter.value, city: elements.cityFilter.value, zip: elements.zipFilter.value };
}
function refreshFacilityControls() {
  const filterValue = elements.facilityFilter.value;
  const bulkValue = elements.bulkFacility.value;
  const filterOptions = facilityFilterOptions(currentFacilities(), allResourceRecords());
  elements.facilityFilter.innerHTML = '<option value="">All facilities</option>' + filterOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("");
  if ([...elements.facilityFilter.options].some((option) => option.value === filterValue)) elements.facilityFilter.value = filterValue;
  elements.bulkFacility.innerHTML = '<option value="">Choose a facility</option>' + currentFacilities().map((facility) => `<option value="${escapeHtml(facility.id)}">${escapeHtml(facility.name)}${facility.sourceType === "demo" ? " (invented demo)" : ""}</option>`).join("");
  if ([...elements.bulkFacility.options].some((option) => option.value === bulkValue)) elements.bulkFacility.value = bulkValue;
}
function selectedResourceRecords() {
  const selected = state.selectedResourceIds;
  return allResourceRecords().filter((record) => selected.has(record.id));
}
function updateBulkControls() {
  const selected = selectedResourceRecords();
  const facility = currentFacilities().find((item) => item.id === elements.bulkFacility.value);
  elements.selectedCount.textContent = `${selected.length} asset${selected.length === 1 ? "" : "s"} selected · filters included`;
  if (facility) {
    const address = extractFacilityAddress(facility);
    elements.bulkPreview.textContent = `Will copy ${[address.name, address.address, address.city, address.state, address.zip].filter(Boolean).join(", ") || "facility name"}; ${address.geometry ? "geometry included" : "no usable geometry"}.`;
  } else elements.bulkPreview.textContent = "Select assets and a facility. Nothing is saved until Apply facility is clicked.";
  try {
    const plan = planBulkFacilityAssignment({ selectedRecords: selected, facility, signedIn: state.signedIn, layer: state.resourceLayer });
    elements.applyBulkFacility.disabled = false;
    elements.applyBulkFacility.title = plan.geometryOnly ? "Only geometry can be stored because no editable location fields were bound." : "Apply this facility to selected assets";
    elements.bulkStatus.textContent = plan.geometryOnly ? "Ready. Service assignment will store geometry only; facility/address text is not stored by this layer." : "Ready to apply after explicit confirmation.";
  } catch (error) {
    elements.applyBulkFacility.disabled = true;
    elements.applyBulkFacility.title = error.message;
    elements.bulkStatus.textContent = error.message;
  }
}
const resourceSortAccessors = {
  assetType: (record) => record.assetType,
  department: (record) => record.department,
  category: (record) => record.category,
  quantity: (record) => Number.isFinite(Number(record.quantity?.estimate)) ? Number(record.quantity.estimate) : record.quantity?.raw,
  status: (record) => record.status,
  source: (record) => record.sourceType || record.source
};
const facilitySortAccessors = {
  name: (record) => record.name,
  type: (record) => record.type,
  status: (record) => record.status,
  source: (record) => record.sourceType || record.source
};
function syncSortButtons(table, sort) {
  document.querySelectorAll(`[data-sort-table="${table}"]`).forEach((button) => {
    const active = button.dataset.sortKey === sort.key && button.dataset.sortDirection === sort.direction;
    button.setAttribute("aria-pressed", String(active));
  });
}
function syncSortResetButton() {
  const active = Boolean(state.resourceSort.key || state.facilitySort.key);
  elements.resetSortOrder.disabled = !active;
  elements.resetSortOrder.title = active ? "Restore the original resource and facility list order" : "The lists are already in their original order";
}
function syncSelectedRows() {
  document.querySelectorAll("tr[data-record-id]").forEach((row) => {
    const selected = row.dataset.recordId === state.selectedId;
    row.classList.toggle("selected-row", selected);
    if (selected) row.setAttribute("aria-current", "true"); else row.removeAttribute("aria-current");
  });
}
function renderResources() {
  const allRecords = allResourceRecords();
  elements.resourceCount.textContent = allRecords.length;
  state.selectedResourceIds = cleanSelectedIds(state.selectedResourceIds, allRecords);
  const filters = currentResourceFilters();
  const records = sortRows(filterResourceRecords(allRecords, filters), state.resourceSort, resourceSortAccessors);
  syncSortButtons("resources", state.resourceSort);
  syncSortResetButton();
  state.visibleResourceIds = records.map((record) => record.id);
  elements.inventoryCount.textContent = records.length;
  const active = [["search", filters.search], ["source", filters.source], ["facility", filters.facility], ["city", filters.city], ["ZIP", filters.zip]].filter(([, value]) => String(value).trim());
  elements.activeFilters.textContent = active.length ? `Active filters: ${active.map(([name, value]) => `${name} “${value}”`).join(" · ")}` : "No inventory filters active.";
  const visibleSelected = records.filter((record) => state.selectedResourceIds.has(record.id)).length;
  elements.selectAllVisible.checked = records.length > 0 && visibleSelected === records.length;
  elements.selectAllVisible.indeterminate = visibleSelected > 0 && visibleSelected < records.length;
  if (!records.length) {
    elements.resourceRows.innerHTML = '<tr><td colspan="7" class="empty-cell">No inventory records match the current filters.</td></tr>';
    updateBulkControls();
    updateReportAvailability();
    return;
  }
  elements.resourceRows.innerHTML = records.map((record) => {
    const symbol = resourceSymbolFor(record, state.config?.symbols?.resourceIconUrl || "");
    return `
    <tr data-record-id="${escapeHtml(record.id)}" tabindex="0" aria-label="Open ${escapeHtml(record.assetType)} details">
      <td class="select-column"><input class="resource-select" type="checkbox" data-select-id="${escapeHtml(record.id)}" ${state.selectedResourceIds.has(record.id) ? "checked" : ""} aria-label="Select ${escapeHtml(record.assetType)} for bulk actions"></td>
      <td><div class="resource-name"><img class="resource-list-icon" src="${escapeHtml(symbol.url)}" alt=""><span><strong>${escapeHtml(record.assetType)}</strong><small>${escapeHtml(symbol.label)}</small></span></div><span class="mobile-meta">${escapeHtml(record.department || "No department")}</span></td>
      <td>${escapeHtml(record.department || "—")}</td>
      <td>${escapeHtml(record.category || "—")}</td>
      <td>${escapeHtml(record.quantity?.raw || "—")}</td>
      <td><span class="status status-${escapeHtml((record.status || "unknown").toLowerCase().replace(/\s+/g, "-"))}">${escapeHtml(record.status || "Unknown")}</span></td>
      <td>${sourceLabel(record)}</td>
    </tr>`;
  }).join("");
  syncSelectedRows();
  updateBulkControls();
  updateReportAvailability();
}

function renderFacilities() {
  const records = sortRows(currentFacilities(), state.facilitySort, facilitySortAccessors);
  syncSortButtons("facilities", state.facilitySort);
  syncSortResetButton();
  elements.facilityCount.textContent = records.length;
  elements.facilityRows.innerHTML = records.length ? records.map((record) => {
    const iconUrl = state.config?.symbols?.facilityIconUrl || FACILITY_SYMBOL_URL;
    return `
    <tr data-record-id="${escapeHtml(record.id)}" tabindex="0" aria-label="Open ${escapeHtml(record.name)} details">
      <td><div class="resource-name"><img class="resource-list-icon" src="${escapeHtml(iconUrl)}" alt=""><span><strong>${escapeHtml(record.name)}</strong></span></div></td><td>${escapeHtml(record.type)}</td><td>${escapeHtml(record.status)}</td><td>${sourceLabel(record)}</td>
    </tr>`;
  }).join("") : '<tr><td colspan="4" class="empty-cell">No facilities are loaded.</td></tr>';
  syncSelectedRows();
  updateReportAvailability();
}

function recordById(id) {
  return [...allResourceRecords(), ...currentFacilities()].find((record) => record.id === id);
}

function openDetailPanel() {
  elements.detailPanel.classList.add("open");
  elements.detailPanel.setAttribute("aria-hidden", "false");
}
function closeDetailPanel() {
  cancelPointSelection();
  clearPlacementPreview();
  elements.detailPanel.classList.remove("open");
  elements.detailPanel.setAttribute("aria-hidden", "true");
  state.selectedId = null;
  syncSelectedRows();
  updateReportAvailability();
  restoreListView();
}
function showDetail(id) {
  const record = recordById(id);
  if (!record) return;
  openDetailPanel();
  state.selectedId = id;
  syncSelectedRows();
  updateReportAvailability();
  const isFacility = Boolean(record.name && !record.assetType);
  const facilityAddress = isFacility ? extractFacilityAddress(record) : null;
  const attributes = Object.entries(record.attributes || {}).filter(([, value]) => value != null && String(value).trim()).slice(0, 12);
  elements.detail.innerHTML = `
    <div class="detail-hero">${sourceLabel(record)}<h2>${escapeHtml(record.assetType || record.name)}</h2><p>${escapeHtml(isFacility ? record.type : record.category || "Uncategorized")}</p>
      ${isFacility ? '<div class="detail-actions"><button class="btn detail-edit-action equal-action" id="editFacilityButton" type="button">Edit facility</button><button class="btn btn-primary equal-action" id="addNewFacilityButton" type="button">Add new</button><button class="btn btn-danger equal-action" id="removeFacilityButton" type="button">Remove facility</button></div>' : '<button class="btn detail-edit-action" id="editAssetButton" type="button">Edit asset</button>'}</div>
    <dl class="detail-grid">
      <div><dt>Source</dt><dd>${escapeHtml(record.source)}</dd></div>
      ${isFacility ? "" : `<div><dt>Location</dt><dd>${escapeHtml(record.locationMethod || (record.geometry ? "Service geometry" : "No geometry"))}${record.isMockLocation ? " (mock)" : ""}</dd></div>`}
      ${isFacility ? `<div><dt>Status</dt><dd>${escapeHtml(record.status)}</dd></div><div><dt>Department</dt><dd>${escapeHtml(record.department || "Not provided")}</dd></div><div class="detail-wide"><dt>Address</dt><dd>${escapeHtml([facilityAddress.address, facilityAddress.city, facilityAddress.state, facilityAddress.zip].filter(Boolean).join(", ") || "Not provided")}</dd></div><div class="detail-wide"><dt>Location</dt><dd>${record.geometry ? "Service geometry available" : "No geometry"}</dd></div>` : `
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
const LOCATION_EDIT_FIELDS = [["locationName", "Location name"], ["address", "Address"], ["city", "City"], ["state", "State"], ["zip", "ZIP"]];
function fieldControl(field, value, additional = false) {
  const id = `${additional ? "additional" : "edit"}-${additional ? field.name : field.key}`;
  const coded = field.domain?.codedValues;
  if (Array.isArray(coded)) return `<label><span>${escapeHtml(field.label || field.alias || field.name)}${field.nullable === false ? " *" : ""}${field.disabled ? " (read-only: not stored by this layer)" : field.lookupOnly ? " (location lookup only; not stored)" : ""}</span><select id="${escapeHtml(id)}" ${additional ? `data-additional-field="${escapeHtml(field.name)}"` : `name="${escapeHtml(field.key)}"`} ${field.nullable === false ? "required" : ""} ${field.disabled ? "disabled" : ""}><option value="">${field.nullable === false ? "Choose a value" : "No value"}</option>${coded.map((entry) => `<option value="${escapeHtml(entry.code)}" ${String(entry.code) === String(value) ? "selected" : ""}>${escapeHtml(entry.name)}</option>`).join("")}</select></label>`;
  return `<label><span>${escapeHtml(field.label || field.alias || field.name)}${field.nullable === false ? " *" : ""}${field.disabled ? " (read-only: not stored by this layer)" : field.lookupOnly ? " (location lookup only; not stored)" : ""}</span><input id="${escapeHtml(id)}" ${additional ? `data-additional-field="${escapeHtml(field.name)}"` : `name="${escapeHtml(field.key)}"`} value="${escapeHtml(value ?? "")}" ${field.length ? `maxlength="${field.length}"` : ""} ${field.nullable === false ? "required" : ""} ${field.disabled ? "disabled" : ""}></label>`;
}
function geometryCoordinates(geometry) {
  if (!geometry) return { latitude: "", longitude: "" };
  const latitude = Number.isFinite(geometry.latitude) ? geometry.latitude : geometry.spatialReference?.wkid === 4326 && Number.isFinite(geometry.y) ? geometry.y : null;
  const longitude = Number.isFinite(geometry.longitude) ? geometry.longitude : geometry.spatialReference?.wkid === 4326 && Number.isFinite(geometry.x) ? geometry.x : null;
  return { latitude: latitude == null ? "" : latitude.toFixed(6), longitude: longitude == null ? "" : longitude.toFixed(6) };
}

function updateCoordinateFields(prefix, geometry) {
  const coordinates = geometryCoordinates(geometry);
  const latitude = byId(`${prefix}Latitude`);
  const longitude = byId(`${prefix}Longitude`);
  if (latitude) latitude.value = coordinates.latitude;
  if (longitude) longitude.value = coordinates.longitude;
}

function devicePoint() {
  if (!navigator.geolocation) return Promise.reject(new Error("Device location is not available in this browser."));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ type: "point", longitude: coords.longitude, latitude: coords.latitude, spatialReference: { wkid: 4326 } }),
    (error) => reject(new Error(error.code === 1 ? "Location permission was denied. Allow location access and try again." : error.code === 2 ? "Your device location is unavailable." : "Device location timed out. Try again.")),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
  ));
}

function showAssetEditor() {
  cancelPointSelection(); clearPlacementPreview();
  const record = recordById(state.selectedId);
  if (!record || !record.assetType) return;
  openDetailPanel();
  const values = editorValuesFromRecord(record);
  const isService = record.sourceType === "service";
  const gate = isService ? serviceEditGate({ signedIn: state.signedIn, layer: state.resourceLayer, record }) : record.sourceType === "import"
    ? { allowed: true, reason: "Save changes updates only this tab's strict import session." }
    : { allowed: false, reason: "Invented demo records cannot be persisted." };
  const bindings = isService ? inferFieldBindings(state.resourceLayer?.fields || []) : {};
  const additional = isService ? additionalEditableFields(state.resourceLayer?.fields || [], bindings, state.resourceLayer?.objectIdField) : [];
  const facilities = currentFacilities();
  const displayedNormalizedFields = [...EDIT_FIELDS, ...LOCATION_EDIT_FIELDS];
  const editableNormalized = isService ? displayedNormalizedFields.filter(([key]) => {
    const schema = state.resourceLayer?.fields?.find((field) => field.name === bindings[key]);
    return schema && schema.editable !== false;
  }).map(([, label]) => label) : displayedNormalizedFields.map(([, label]) => label);
  const readOnlyNormalized = displayedNormalizedFields.map(([, label]) => label).filter((label) => !editableNormalized.includes(label));
  const normalizedFieldControl = (key, label, allowLocationLookup = false) => {
    const schema = isService ? state.resourceLayer?.fields?.find((field) => field.name === bindings[key]) : null;
    const unavailable = isService && (!schema || schema.editable === false);
    return fieldControl({ ...(schema || {}), key, label, disabled: unavailable && !allowLocationLookup, lookupOnly: unavailable && allowLocationLookup }, values[key]);
  };
  const editExplanation = isService
    ? `Editable here: ${editableNormalized.join(", ") || "no normalized fields"}${additional.length ? `, plus ${additional.length} schema-approved field${additional.length === 1 ? "" : "s"} under Additional service attributes` : ""}. ${readOnlyNormalized.length ? `Read-only/not stored here: ${readOnlyNormalized.join(", ")}. ` : ""}Fields are enabled only when the layer marks them editable and a unique safe schema binding is found; object IDs, GlobalIDs, geometry metadata, editor-tracking, and other system fields remain intentionally read-only.`
    : record.sourceType === "import" ? "All displayed inventory and location fields are editable in this tab's import session. The source CSV is not changed." : "Invented demo fields are read-only and cannot be persisted.";
  const coordinates = geometryCoordinates(record.geometry);
  state.editGeometry = record.geometry || null; state.geocodePreview = null; state.editLocationMode = "current";
  elements.detail.innerHTML = `<form id="assetEditForm" class="asset-edit-form" novalidate>
    <div class="editor-heading"><div><p class="eyebrow">Editing</p><h2>${escapeHtml(record.assetType)}</h2></div><button type="button" class="btn btn-quiet" id="cancelAssetEdit">Cancel</button></div>
    <details class="editing-information"><summary>Editing Information</summary><p class="edit-boundary">${escapeHtml(gate.reason)} ${escapeHtml(editExplanation)}</p></details>
    <fieldset><legend>Inventory attributes</legend><div class="form-grid">${EDIT_FIELDS.map(([key, label]) => normalizedFieldControl(key, label)).join("")}</div></fieldset>
    <fieldset><legend>Location</legend><div class="location-choices" role="radiogroup" aria-label="Location choice">
      <label><input type="radio" name="locationMode" value="current" checked> Retain current / selected geometry</label>
      <label><input type="radio" name="locationMode" value="facility"> Existing facility</label>
      <label><input type="radio" name="locationMode" value="address"> Enter and locate an address</label>
      <label><input type="radio" name="locationMode" value="map"> Place a point on the map</label></div>
      <label id="facilityChoice" hidden><span>Existing facility</span><select id="editFacility"><option value="">Choose a loaded facility</option>${facilities.map((facility) => `<option value="${escapeHtml(facility.id)}">${escapeHtml(facility.name)}</option>`).join("")}</select></label>
      <div class="form-grid location-fields">
        ${LOCATION_EDIT_FIELDS.map(([key, label]) => normalizedFieldControl(key, label, true)).join("")}
      </div>
      <div class="asset-location-actions"><button id="locateAddress" class="btn btn-quiet equal-action" type="button" hidden>Locate address</button><button id="pickAssetPoint" class="btn btn-quiet equal-action" type="button" hidden>Start map placement</button><button id="cancelAssetPoint" class="btn btn-quiet equal-action" type="button" hidden>Cancel placement</button><button id="locateAssetDevice" class="btn btn-quiet equal-action" type="button">Locate me</button></div>
      <div class="form-grid coordinate-fields"><label><span>Latitude</span><input id="editLatitude" value="${escapeHtml(coordinates.latitude)}" readonly aria-describedby="editCoordinateHelp"></label><label><span>Longitude</span><input id="editLongitude" value="${escapeHtml(coordinates.longitude)}" readonly aria-describedby="editCoordinateHelp"></label></div>
      <p id="editCoordinateHelp" class="location-help">Coordinates are read-only previews populated by current geometry, map placement, address lookup, or device location.</p>
      <p id="editLocationStatus" class="form-status" role="status" aria-live="polite">Current geometry will be retained.</p>
    </fieldset>
    ${additional.length ? `<details class="additional-attributes"><summary>Additional service attributes (${additional.length})</summary><div class="form-grid">${additional.map((field) => fieldControl(field, record.attributes?.[field.name], true)).join("")}</div></details>` : ""}
    <div id="editValidation" class="form-status" role="alert"></div><div class="editor-actions"><button class="btn equal-action" type="submit" ${gate.allowed ? "" : "disabled"}>Save changes</button><button class="btn btn-quiet equal-action" type="button" id="cancelAssetEdit2">Cancel</button></div>
  </form>`;
  if (record.geometry) setPlacementPreview(record.geometry);
}

function facilityFieldControl(definition, field, value, additional = false) {
  const id = `facility-${additional ? "additional-" : ""}${additional ? field.name : definition.key}`;
  const label = definition?.label || field?.alias || field?.name;
  const lookupOnly = !field && ["address", "city", "state", "zip"].includes(definition?.key);
  const disabled = !field && !lookupOnly;
  const required = Boolean(definition?.required || field?.nullable === false);
  const coded = field?.domain?.codedValues;
  const attrs = `${additional ? `data-facility-additional="${escapeHtml(field.name)}"` : `name="${escapeHtml(definition.key)}"`} ${required ? "required" : ""} ${disabled ? "disabled" : ""}`;
  const note = disabled ? '<small class="field-note">Read-only: not stored by this layer.</small>' : lookupOnly ? '<small class="field-note">Used for location lookup only; not stored by this layer.</small>' : "";
  if (Array.isArray(coded)) return `<label><span>${escapeHtml(label)}${required ? " *" : ""}</span><select id="${escapeHtml(id)}" ${attrs}><option value="">${required ? "Choose a value" : "No value"}</option>${coded.map((entry) => `<option value="${escapeHtml(entry.code)}" ${String(entry.code) === String(value) ? "selected" : ""}>${escapeHtml(entry.name)}</option>`).join("")}</select>${note}</label>`;
  const type = String(field?.type || "").toLowerCase().includes("date") ? "date" : ["integer", "double", "single", "float"].some((part) => String(field?.type || "").toLowerCase().includes(part)) ? "number" : "text";
  return `<label><span>${escapeHtml(label)}${required ? " *" : ""}</span><input id="${escapeHtml(id)}" type="${type}" value="${escapeHtml(value ?? "")}" ${field?.length ? `maxlength="${field.length}"` : ""} ${attrs}>${note}</label>`;
}

function updateFacilitySaveGate() {
  const form = byId("facilityEditForm");
  if (!form) return;
  const record = state.facilityEditMode === "update" ? recordById(state.selectedId) : null;
  const bindings = inferFacilityBindings(state.facilityLayer?.fields || [], state.facilityLayer?.objectIdField);
  const gate = facilityEditGate({ action: state.facilityEditMode === "add" ? "add" : "update", signedIn: state.signedIn, layer: state.facilityLayer, record, bindings, geometry: state.facilityEditGeometry });
  const save = byId("saveFacilityButton");
  save.disabled = !gate.allowed;
  save.title = gate.reason;
  byId("facilityGateStatus").textContent = gate.reason;
}

function showFacilityEditor(mode = "update") {
  cancelPointSelection(); clearPlacementPreview();
  const record = mode === "update" ? recordById(state.selectedId) : null;
  if (mode === "update" && (!record || record.assetType)) return;
  openDetailPanel();
  const layer = state.facilityLayer;
  const bindings = inferFacilityBindings(layer?.fields || [], layer?.objectIdField);
  const values = facilityValuesFromRecord(record || {}, bindings);
  const additional = additionalFacilityFields(layer?.fields || [], bindings, layer?.objectIdField);
  const compatibility = geometryCompatibility(layer, record?.geometry || null);
  const coordinates = geometryCoordinates(record?.geometry);
  state.facilityEditMode = mode;
  state.facilityEditGeometry = record?.geometry || null;
  state.facilityLocationMode = mode === "update" ? "retain" : "map";
  state.facilityGeocodePreview = null;
  elements.detail.innerHTML = `<form id="facilityEditForm" class="asset-edit-form" novalidate>
    <div class="editor-heading"><div><p class="eyebrow">${mode === "add" ? "New facility" : "Editing facility"}</p><h2>${escapeHtml(record?.name || "Add facility")}</h2></div><button type="button" class="btn btn-quiet" id="cancelFacilityEdit">Cancel</button></div>
    <details class="editing-information"><summary>Editing Information</summary><p class="edit-boundary">Facility writes require sign-in, matching layer capability, editable fields, valid geometry, and an explicit Save facility action. Demo facilities are never persisted.</p></details>
    <fieldset><legend>Facility attributes</legend><div class="form-grid">${FACILITY_FIELDS.map((definition) => { const field = layer?.fields?.find((item) => item.name === bindings[definition.key]); return facilityFieldControl(definition, field, values[definition.key]); }).join("")}</div></fieldset>
    <fieldset><legend>Location</legend><div class="location-choices" role="radiogroup" aria-label="Facility location choice">
      ${mode === "update" ? '<label><input type="radio" name="facilityLocationMode" value="retain" checked> Retain existing geometry</label>' : ""}
      <label><input type="radio" name="facilityLocationMode" value="address"> Locate from address</label>
      <label><input type="radio" name="facilityLocationMode" value="map" ${mode === "add" ? "checked" : ""} ${compatibility.pointPlacement ? "" : "disabled"}> Place on map</label></div>
      <div class="facility-location-actions"><button id="locateFacilityAddress" class="btn btn-quiet equal-action" type="button" hidden>Locate address</button><button id="pickFacilityPoint" class="btn btn-quiet equal-action" type="button" ${mode === "add" && compatibility.pointPlacement ? "" : "hidden"}>Start map placement</button><button id="cancelFacilityPoint" class="btn btn-quiet equal-action" type="button" hidden>Cancel placement</button><button id="locateFacilityDevice" class="btn btn-quiet equal-action" type="button">Locate me</button></div>
      <div class="form-grid coordinate-fields"><label><span>Latitude</span><input id="facilityLatitude" value="${escapeHtml(coordinates.latitude)}" readonly aria-describedby="facilityCoordinateHelp"></label><label><span>Longitude</span><input id="facilityLongitude" value="${escapeHtml(coordinates.longitude)}" readonly aria-describedby="facilityCoordinateHelp"></label></div>
      <p id="facilityCoordinateHelp" class="location-help">Coordinates are read-only previews populated by retained geometry, map placement, address lookup, or device location.</p>
      <p id="facilityLocationStatus" class="form-status" role="status" aria-live="polite">${compatibility.pointPlacement ? (mode === "update" ? "Existing geometry will be retained unless another option is selected." : "Choose Start map placement, enter and locate an address, or use device location. The preview is not saved yet.") : `Point placement is unavailable: ${escapeHtml(compatibility.reason)}`}</p>
    </fieldset>
    ${additional.length ? `<details class="additional-attributes"><summary>Additional attributes (${additional.length})</summary><div class="form-grid">${additional.map((field) => facilityFieldControl(null, field, record?.attributes?.[field.name], true)).join("")}</div></details>` : ""}
    <p id="facilityGateStatus" class="form-status"></p><div id="facilityValidation" class="form-status" role="alert"></div>
    <div class="editor-actions"><button id="saveFacilityButton" class="btn btn-primary" type="submit">Save facility</button><button class="btn btn-quiet" type="button" id="cancelFacilityEdit2">Cancel</button></div>
  </form>`;
  if (record?.geometry) setPlacementPreview(record.geometry);
  updateFacilitySaveGate();
}

function facilityFormValues(form) {
  return Object.fromEntries(FACILITY_FIELDS.map(({ key }) => [key, form.elements.namedItem(key)?.value || ""]));
}

async function geocodeFacility(forStorage = false) {
  const form = byId("facilityEditForm");
  const values = facilityFormValues(form);
  if (![values.address, values.city, values.state, values.zip].some((value) => value.trim())) throw new Error("Enter an address, city, state, or ZIP before locating.");
  const locator = await $arcgis.import("@arcgis/core/rest/locator.js");
  const results = await locator.addressToLocations(await locatorUrl(), { address: { address: values.address, city: values.city, region: values.state, postal: values.zip }, maxLocations: 5, outFields: ["Match_addr", "Addr_type"], forStorage });
  return selectConfidentAddressMatch(results, 80);
}

async function refreshFacilities(preferredObjectId = null) {
  state.facilityLayer.refresh();
  const features = await queryAllFeatures(state.facilityLayer);
  state.facilities = features.map((feature, index) => facilityFromFeature(feature, index, state.facilityLayer.objectIdField, state.facilityLayer.fields));
  renderAll();
  const selected = preferredObjectId == null ? null : state.facilities.find((facility) => String(facility.objectId) === String(preferredObjectId));
  if (selected) showDetail(selected.id);
  else if (state.selectedId?.startsWith("service-facility-")) { state.selectedId = null; elements.detail.innerHTML = '<div class="empty-state"><strong>Select a record</strong><p>The facilities list has been refreshed.</p></div>'; }
}

async function saveFacility(event) {
  event.preventDefault();
  const form = event.target;
  if (!form.reportValidity()) return;
  const mode = state.facilityEditMode;
  const record = mode === "update" ? recordById(state.selectedId) : null;
  const button = byId("saveFacilityButton"); button.disabled = true;
  const status = byId("facilityValidation"); status.textContent = "Validating facility…";
  try {
    let geometry = state.facilityEditGeometry;
    if (state.facilityLocationMode === "address") {
      if (!state.facilityGeocodePreview) throw new Error("Use Locate address and review a match of at least 80 before saving.");
      status.textContent = "Confirming address for persisted use…";
      geometry = (await geocodeFacility(true)).location;
    }
    const action = mode === "add" ? "add" : "update";
    const bindings = inferFacilityBindings(state.facilityLayer.fields || [], state.facilityLayer.objectIdField);
    const gate = facilityEditGate({ action, signedIn: state.signedIn, layer: state.facilityLayer, record, bindings, geometry });
    if (!gate.allowed) throw new Error(gate.reason);
    const additionalValues = Object.fromEntries([...form.querySelectorAll("[data-facility-additional]")].map((input) => [input.dataset.facilityAdditional, input.value]));
    const payload = buildFacilityFeature({ mode, record, values: facilityFormValues(form), additionalValues, layer: state.facilityLayer, bindings, geometry });
    if (payload.errors.length) throw new Error(payload.errors.join(" "));
    status.textContent = "Saving explicit facility edit…";
    const result = mode === "add"
      ? await state.facilityLayer.applyEdits({ addFeatures: [payload.feature] })
      : await state.facilityLayer.applyEdits({ updateFeatures: [payload.feature] });
    const editResult = mode === "add" ? result.addFeatureResults?.[0] : result.updateFeatureResults?.[0];
    if (!editResult || editResult.error) throw new Error(editResult?.error?.message || "The service did not confirm the facility edit.");
    clearPlacementPreview();
    await refreshFacilities(editResult.objectId ?? record?.objectId);
    toast(`Facility ${mode === "add" ? "created" : "updated"} successfully.`, "success");
  } catch (error) { status.textContent = error.message; status.dataset.tone = "error"; button.disabled = false; }
}

function openRemoveFacilityDialog(record) {
  const gate = facilityEditGate({ action: "delete", signedIn: state.signedIn, layer: state.facilityLayer, record });
  if (!gate.allowed) { toast(gate.reason, "error"); return; }
  const warning = deleteWarningModel(record, allResourceRecords());
  state.pendingDeleteFacilityId = record.id;
  elements.removeFacilityMessage.textContent = warning.message;
  elements.removeFacilityDialog.showModal();
}

async function removeFacility() {
  const record = recordById(state.pendingDeleteFacilityId);
  if (!record) { elements.removeFacilityDialog.close(); return; }
  const gate = facilityEditGate({ action: "delete", signedIn: state.signedIn, layer: state.facilityLayer, record });
  if (!gate.allowed) { elements.removeFacilityMessage.textContent = gate.reason; return; }
  elements.confirmRemoveFacility.disabled = true;
  try {
    const result = await state.facilityLayer.applyEdits({ deleteFeatures: [{ attributes: { [state.facilityLayer.objectIdField]: record.objectId } }] });
    const editResult = result.deleteFeatureResults?.[0];
    if (!editResult || editResult.error) throw new Error(editResult?.error?.message || "The service did not confirm removal.");
    elements.removeFacilityDialog.close(); state.pendingDeleteFacilityId = null;
    await refreshFacilities();
    toast("Facility removed. Asset records were not changed.", "success");
  } catch (error) { elements.removeFacilityMessage.textContent = `Removal failed: ${error.message}`; }
  finally { elements.confirmRemoveFacility.disabled = false; }
}

function formValues(form) { return Object.fromEntries(Array.from(form.elements).filter((element) => element.name && element.name !== "locationMode").map((element) => [element.name, element.value])); }
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
  return selectConfidentAddressMatch(results, 80);
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
      state.stagedImport = updateImportSessionRecord(record.id, patch); clearPlacementPreview(); consumeStagedImport(); renderAll(); showDetail(record.id);
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
    clearPlacementPreview(); renderAll(); showDetail(record.id); toast("Service asset updated successfully.");
  } catch (error) { setEditorStatus(error.message, "error"); submit.disabled = false; }
}

async function refreshUpdatedServiceRecords(objectIds) {
  if (!objectIds.length) return;
  state.resourceLayer.refresh();
  const refreshed = await state.resourceLayer.queryFeatures({ objectIds, outFields: ["*"], returnGeometry: true, outSpatialReference: { wkid: 4326 } });
  for (const feature of refreshed.features || []) {
    const updated = resourceFromFeature(feature, 0, state.resourceLayer.fields, state.resourceLayer.objectIdField);
    const index = state.resources.findIndex((record) => record.objectId === updated.objectId);
    if (index >= 0) state.resources[index] = updated;
  }
}

async function applyBulkFacility() {
  const facility = currentFacilities().find((item) => item.id === elements.bulkFacility.value);
  let plan;
  try {
    plan = planBulkFacilityAssignment({ selectedRecords: selectedResourceRecords(), facility, signedIn: state.signedIn, layer: state.resourceLayer });
  } catch (error) {
    elements.bulkStatus.textContent = error.message;
    return;
  }
  elements.applyBulkFacility.disabled = true;
  elements.bulkStatus.textContent = "Validating and applying assignment…";
  try {
    if (plan.importedIds.length) validateImportSessionRecordUpdates(plan.importedIds, plan.assignment);
    if (plan.serviceFeatures.length) {
      const result = await state.resourceLayer.applyEdits({ updateFeatures: plan.serviceFeatures });
      const summary = summarizeServiceUpdateResults(result, plan.serviceRecords);
      await refreshUpdatedServiceRecords(summary.successfulObjectIds);
      if (summary.failureCount) {
        const details = summary.failures.map((failure) => `${failure.objectId ?? failure.id}: ${failure.message}`).join("; ");
        throw new Error(`Service batch partially completed: ${summary.successCount} succeeded, ${summary.failureCount} failed. Imported assets were not changed. ${details}`);
      }
    }
    if (plan.importedIds.length) {
      state.stagedImport = updateImportSessionRecords(plan.importedIds, plan.assignment);
      consumeStagedImport();
    }
    renderAll();
    if (state.selectedId && recordById(state.selectedId)) showDetail(state.selectedId);
    const textBoundary = plan.geometryOnly ? " Service facility/address text was not stored because the layer has no editable bound location fields." : "";
    const message = `Facility assigned to ${plan.serviceFeatures.length + plan.importedIds.length} selected asset${plan.serviceFeatures.length + plan.importedIds.length === 1 ? "" : "s"}.${textBoundary}`;
    elements.bulkStatus.textContent = message;
    toast(message, "success");
  } catch (error) {
    consumeStagedImport();
    renderAll();
    elements.bulkStatus.textContent = error.message;
    toast(error.message, "error");
  }
}

function setInventoryType(type) {
  if (state.inventoryType !== type && state.selectedId) closeDetailPanel();
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
  refreshFacilityControls();
  renderResources();
  renderFacilities();
  updateMetrics();
  updateReportAvailability();
}

function reportScopedResources() {
  let resources = filterResourceRecords(allResourceRecords(), currentResourceFilters());
  const selected = recordById(state.selectedId);
  if (selected && !selected.assetType) {
    const facility = String(selected.name || "").trim().toLowerCase();
    resources = resources.filter((record) => String(resourceFacilityName(record)).trim().toLowerCase() === facility);
  }
  return resources;
}
function reportScopeLabel() {
  const filters = currentResourceFilters();
  const parts = Object.entries(filters).filter(([, value]) => String(value || "").trim()).map(([name, value]) => `${name}: ${value}`);
  const selected = recordById(state.selectedId);
  if (selected && !selected.assetType) parts.push(`selected facility: ${selected.name}`);
  return parts.length ? parts.join("; ") : "All records currently shown in the lists";
}
function updateReportAvailability() {
  const resources = reportScopedResources();
  elements.reportType.disabled = !resources.length && !currentFacilities().length;
  const kind = elements.reportType.value;
  elements.exportReportButton.disabled = !kind || (kind === "available" ? !resources.some(isResourceAvailable) : kind === "facility" ? !resources.length : !resources.length && !currentFacilities().length);
}
function downloadReport(blob, name) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
async function exportSelectedReport() {
  const kind = elements.reportType.value;
  if (!kind) return;
  const button = elements.exportReportButton;
  button.disabled = true; button.textContent = "…"; button.setAttribute("aria-busy", "true");
  try {
    const resources = reportScopedResources();
    const scope = reportScopeLabel();
    const facilities = (() => {
      const selected = recordById(state.selectedId);
      return selected && !selected.assetType ? [selected] : currentFacilities();
    })();
    let report; let fileName; let mapImage = null;
    if (kind === "summary") { report = reportSummary(resources, facilities, scope); fileName = "inventory-summary"; }
    else if (kind === "facility") { report = resourcesAtFacilitiesReport(resources, scope); fileName = "resources-at-facility"; }
    else {
      report = availableResourcesReport(resources, scope);
      fileName = "resources-available";
      mapImage = await captureResourceReportMap(report.records);
    }
    const logo = await loadPdfImage(state.config.branding?.logoUrl || "").catch(() => null);
    const branding = { appName: state.config.branding?.appName, subtitle: state.config.branding?.subtitle, logo, mapImage, colors: state.config.branding?.colors };
    const blob = buildInventoryReportPdf(report, new Date(), branding);
    downloadReport(blob, fileName);
    toast(`${report.title} downloaded.`, "success");
  } catch (error) { toast(error.message || "The report could not be generated.", "error"); }
  finally { button.textContent = "PDF"; button.removeAttribute("aria-busy"); updateReportAvailability(); }
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
  elements.mapMessage.innerHTML = "<strong>Loading operational layers…</strong><span>Resource and facility writes require explicit authorized actions and compatible service capabilities.</span>";
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
      state.user = await getAuthenticatedUser();
      presentSession();
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
  elements.reportType.addEventListener("change", updateReportAvailability);
  elements.exportReportButton.addEventListener("click", exportSelectedReport);
  elements.demoButton.addEventListener("click", () => {
    if (state.serviceAvailable) return;
    state.demoActive = true;
    displayDemo(DEMO_RESOURCES, DEMO_FACILITIES);
    elements.mapMessage.hidden = true;
    elements.serviceStatus.textContent = "Invented demo mode — not operational data";
    setStatus("Invented demo", "warn");
    renderAll();
  });
  document.querySelectorAll("[data-sort-table]").forEach((button) => button.addEventListener("click", () => {
    const sort = { key: button.dataset.sortKey, direction: button.dataset.sortDirection };
    if (button.dataset.sortTable === "resources") { state.resourceSort = sort; renderResources(); }
    else { state.facilitySort = sort; renderFacilities(); }
  }));
  elements.resetSortOrder.addEventListener("click", () => {
    state.resourceSort = { key: null, direction: "asc" };
    state.facilitySort = { key: null, direction: "asc" };
    renderResources();
    renderFacilities();
  });
  elements.resourceSearch.addEventListener("input", renderResources);
  elements.sourceFilter.addEventListener("change", renderResources);
  elements.facilityFilter.addEventListener("change", renderResources);
  elements.cityFilter.addEventListener("input", renderResources);
  elements.zipFilter.addEventListener("input", renderResources);
  elements.clearFilters.addEventListener("click", () => {
    elements.resourceSearch.value = ""; elements.sourceFilter.value = ""; elements.facilityFilter.value = ""; elements.cityFilter.value = ""; elements.zipFilter.value = ""; renderResources();
  });
  elements.bulkToggle.addEventListener("click", () => {
    const expanded = elements.bulkToggle.getAttribute("aria-expanded") === "true";
    elements.bulkToggle.setAttribute("aria-expanded", String(!expanded));
    elements.bulkContent.hidden = expanded;
  });
  elements.bulkFacility.addEventListener("change", updateBulkControls);
  elements.applyBulkFacility.addEventListener("click", applyBulkFacility);
  elements.selectAllVisible.addEventListener("change", () => {
    for (const id of state.visibleResourceIds) elements.selectAllVisible.checked ? state.selectedResourceIds.add(id) : state.selectedResourceIds.delete(id);
    renderResources();
  });
  elements.resourceRows.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-select-id]");
    if (!checkbox) return;
    checkbox.checked ? state.selectedResourceIds.add(checkbox.dataset.selectId) : state.selectedResourceIds.delete(checkbox.dataset.selectId);
    renderResources();
  });
  elements.mockedToggle.addEventListener("change", () => setMockedVisible(elements.mockedToggle.checked));
  elements.resourceTab.addEventListener("click", () => setInventoryType("resources"));
  elements.facilityTab.addEventListener("click", () => setInventoryType("facilities"));
  elements.addFacilityButton.addEventListener("click", () => showFacilityEditor("add"));
  elements.detailClose.addEventListener("click", closeDetailPanel);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && elements.detailPanel.classList.contains("open") && !elements.removeFacilityDialog.open) closeDetailPanel(); });
  elements.cancelRemoveFacility.addEventListener("click", () => { state.pendingDeleteFacilityId = null; elements.removeFacilityDialog.close(); });
  elements.confirmRemoveFacility.addEventListener("click", removeFacility);
  const activateRow = (event) => {
    if (event.target.closest("input, button, select, label")) return;
    const row = event.target.closest("tr[data-record-id]");
    if (!row || (event.type === "keydown" && !["Enter", " "].includes(event.key))) return;
    if (event.type === "keydown") event.preventDefault();
    if (row.dataset.recordId === state.selectedId && elements.detailPanel.classList.contains("open")) { closeDetailPanel(); return; }
    showDetail(row.dataset.recordId);
  };
  elements.resourceRows.addEventListener("click", activateRow);
  elements.resourceRows.addEventListener("keydown", activateRow);
  elements.facilityRows.addEventListener("click", activateRow);
  elements.facilityRows.addEventListener("keydown", activateRow);
  elements.detail.addEventListener("click", async (event) => {
    if (event.target.closest("#editAssetButton")) showAssetEditor();
    if (event.target.closest("#editFacilityButton")) showFacilityEditor("update");
    if (event.target.closest("#addNewFacilityButton")) showFacilityEditor("add");
    if (event.target.closest("#removeFacilityButton")) openRemoveFacilityDialog(recordById(state.selectedId));
    if (event.target.closest("#cancelAssetEdit, #cancelAssetEdit2")) { cancelPointSelection(); clearPlacementPreview(); showDetail(state.selectedId); }
    if (event.target.closest("#cancelFacilityEdit, #cancelFacilityEdit2")) { cancelPointSelection(); clearPlacementPreview(); state.facilityEditMode === "update" ? showDetail(state.selectedId) : (elements.detail.innerHTML = '<div class="empty-state"><strong>Select a record</strong><p>Facility creation was canceled.</p></div>'); }
    if (event.target.closest("#pickFacilityPoint")) {
      const start = byId("pickFacilityPoint"); const cancel = byId("cancelFacilityPoint");
      start.disabled = true; cancel.hidden = false; byId("facilityLocationStatus").textContent = "Map placement active: click once on the map to preview the facility point, or cancel.";
      try { const point = await startPointSelection(); state.facilityEditGeometry = point; updateCoordinateFields("facility", point); byId("facilityLocationStatus").textContent = "Point selected and previewed. It will be used only after Save facility succeeds."; updateFacilitySaveGate(); }
      catch (error) { const status = byId("facilityLocationStatus"); if (status) status.textContent = error.message; }
      finally { if (byId("pickFacilityPoint")) { start.disabled = false; cancel.hidden = true; } }
    }
    if (event.target.closest("#cancelFacilityPoint")) { cancelPointSelection(); byId("facilityLocationStatus").textContent = "Map placement canceled. Existing unsaved geometry was not changed."; }
    if (event.target.closest("#pickAssetPoint")) {
      const start = byId("pickAssetPoint"); const cancel = byId("cancelAssetPoint");
      start.disabled = true; cancel.hidden = false; byId("editLocationStatus").textContent = "Map placement active: click once on the map, or cancel.";
      try { const point = await startPointSelection(); state.editGeometry = point; state.geocodePreview = null; updateCoordinateFields("edit", point); byId("editLocationStatus").textContent = "Point selected and previewed. Fill or review attributes, then Save changes."; }
      catch (error) { const status = byId("editLocationStatus"); if (status) status.textContent = error.message; }
      finally { if (byId("pickAssetPoint")) { start.disabled = false; cancel.hidden = true; } }
    }
    if (event.target.closest("#cancelAssetPoint")) { cancelPointSelection(); byId("editLocationStatus").textContent = "Map placement canceled. The previous unsaved geometry was retained."; }
    if (event.target.closest("#locateFacilityDevice")) {
      const button = byId("locateFacilityDevice"); button.disabled = true; button.setAttribute("aria-busy", "true"); byId("facilityLocationStatus").textContent = "Requesting device location…";
      try { const point = await devicePoint(); state.facilityEditGeometry = point; state.facilityGeocodePreview = null; state.facilityLocationMode = "map"; const mapChoice = byId("facilityEditForm")?.querySelector('input[name="facilityLocationMode"][value="map"]'); if (mapChoice) mapChoice.checked = true; setPlacementPreview(point); updateCoordinateFields("facility", point); byId("facilityLocationStatus").textContent = "Device location populated and previewed. Review attributes, then Save facility."; updateFacilitySaveGate(); }
      catch (error) { byId("facilityLocationStatus").textContent = error.message; }
      finally { button.disabled = false; button.removeAttribute("aria-busy"); }
    }
    if (event.target.closest("#locateAssetDevice")) {
      const button = byId("locateAssetDevice"); button.disabled = true; button.setAttribute("aria-busy", "true"); byId("editLocationStatus").textContent = "Requesting device location…";
      try { const point = await devicePoint(); state.editGeometry = point; state.geocodePreview = null; state.editLocationMode = "map"; const mapChoice = byId("assetEditForm")?.querySelector('input[name="locationMode"][value="map"]'); if (mapChoice) mapChoice.checked = true; setPlacementPreview(point); updateCoordinateFields("edit", point); byId("pickAssetPoint").hidden = false; byId("locateAddress").hidden = true; byId("facilityChoice").hidden = true; byId("editLocationStatus").textContent = "Device location populated and previewed. Review attributes, then Save changes."; }
      catch (error) { byId("editLocationStatus").textContent = error.message; }
      finally { button.disabled = false; button.removeAttribute("aria-busy"); }
    }
    if (event.target.closest("#locateFacilityAddress")) {
      const button = byId("locateFacilityAddress"); button.disabled = true; byId("facilityLocationStatus").textContent = "Locating address for preview…";
      try { const match = await geocodeFacility(false); state.facilityGeocodePreview = match; state.facilityEditGeometry = match.location; setPlacementPreview(match.location); updateCoordinateFields("facility", match.location); byId("facilityLocationStatus").textContent = `Confident match (${match.score}/100): ${match.address || match.attributes?.Match_addr || "address located"}. Geometry will move only if Save facility succeeds.`; updateFacilitySaveGate(); }
      catch (error) { state.facilityGeocodePreview = null; byId("facilityLocationStatus").textContent = error.message; }
      finally { button.disabled = false; }
    }
    if (event.target.closest("#locateAddress")) {
      const button = event.target.closest("#locateAddress"); button.disabled = true; byId("editLocationStatus").textContent = "Locating address for preview…";
      try { const match = await geocodeEditor(false); state.geocodePreview = match; state.editGeometry = match.location; setPlacementPreview(match.location); updateCoordinateFields("edit", match.location); byId("editLocationStatus").textContent = `Confident match (${match.score}/100): ${match.address || match.attributes?.Match_addr || "address located"}. Geometry will move only if Save changes succeeds.`; }
      catch (error) { state.geocodePreview = null; byId("editLocationStatus").textContent = error.message; }
      finally { button.disabled = false; }
    }
  });
  elements.detail.addEventListener("change", (event) => {
    if (event.target.name === "facilityLocationMode") {
      cancelPointSelection(); state.facilityLocationMode = event.target.value; state.facilityGeocodePreview = null;
      const locate = byId("locateFacilityAddress"); const pick = byId("pickFacilityPoint"); const cancel = byId("cancelFacilityPoint");
      locate.hidden = state.facilityLocationMode !== "address"; pick.hidden = state.facilityLocationMode !== "map"; cancel.hidden = true;
      if (state.facilityLocationMode === "retain") { const record = recordById(state.selectedId); state.facilityEditGeometry = record?.geometry || null; setPlacementPreview(state.facilityEditGeometry); updateCoordinateFields("facility", state.facilityEditGeometry); }
      byId("facilityLocationStatus").textContent = state.facilityLocationMode === "retain" ? "Existing geometry will be retained." : state.facilityLocationMode === "address" ? "Review the address fields, then choose Locate address. No movement occurs before Save facility." : "Choose Start map placement, then click once on the map. The point remains a preview until Save facility.";
      updateFacilitySaveGate();
    }
    if (byId("facilityEditForm") && ["address", "city", "state", "zip"].includes(event.target.name) && state.facilityLocationMode === "address") { state.facilityGeocodePreview = null; byId("facilityLocationStatus").textContent = "Address changed. Locate it again before saving."; }
    if (event.target.name === "locationMode") {
      state.editLocationMode = event.target.value; state.geocodePreview = null;
      cancelPointSelection();
      byId("facilityChoice").hidden = state.editLocationMode !== "facility"; byId("locateAddress").hidden = state.editLocationMode !== "address"; byId("pickAssetPoint").hidden = state.editLocationMode !== "map"; byId("cancelAssetPoint").hidden = true;
      if (state.editLocationMode === "current") { const record = recordById(state.selectedId); state.editGeometry = record?.geometry || null; setPlacementPreview(state.editGeometry); updateCoordinateFields("edit", state.editGeometry); }
      byId("editLocationStatus").textContent = state.editLocationMode === "current" ? "Current geometry will be retained." : state.editLocationMode === "facility" ? "Choose a loaded facility to copy its address and geometry." : state.editLocationMode === "address" ? "Enter the address and use Locate address. No geometry changes until Save succeeds." : "Choose Start map placement, then click once on the map. Fill or review attributes before saving.";
    }
    if (event.target.id === "editFacility") {
      const facility = currentFacilities().find((item) => item.id === event.target.value); if (!facility) return;
      const address = extractFacilityAddress(facility); for (const [key, value] of Object.entries({ locationName: address.name, address: address.address, city: address.city, state: address.state, zip: address.zip })) { const input = byId(`edit-${key}`); if (input) input.value = value; }
      state.editGeometry = address.geometry; setPlacementPreview(address.geometry); updateCoordinateFields("edit", address.geometry); byId("editLocationStatus").textContent = address.geometry ? "Facility address and geometry are ready. Save to apply them to this asset." : "Facility address was copied, but the facility has no usable geometry.";
    }
    if (state.editLocationMode === "address" && ["address", "city", "state", "zip"].includes(event.target.name)) { state.geocodePreview = null; byId("editLocationStatus").textContent = "Address changed. Locate it again before saving."; }
  });
  elements.detail.addEventListener("submit", (event) => { if (event.target.id === "assetEditForm") saveAssetEdit(event); if (event.target.id === "facilityEditForm") saveFacility(event); });
}

async function main() {
  cacheElements();
  initializeInventoryResizer({ workspace: elements.workspace, handle: elements.inventoryResizeHandle });
  bindEvents();
  try {
    state.config = await loadConfig("./config/app.json");
    applyPresentation(state.config);
    byId("serviceItemId").textContent = state.config.featureServiceItemId;
    state.stagedImport = readImportSession();
    elements.sourceFilter.value = state.config.operatorDefaults?.defaultSourceFilter || "";
    elements.mockedToggle.checked = state.config.operatorDefaults?.showMockedPoints !== false;
    const auth = await initializeAuth(state.config);
    state.signedIn = auth.signedIn;
    state.oauthConfigured = auth.oauthConfigured;
    state.user = auth.user;
    elements.authStatus.textContent = auth.signedIn ? "Authenticated session found" : auth.oauthConfigured ? "Not signed in · OAuth configured" : "OAuth not configured";
    elements.signInButton.disabled = !auth.oauthConfigured;
    presentSession();
    await initializeMap(state.config, showDetail, { authenticated: state.signedIn, getResources: allResourceRecords });
    setMockedVisible(elements.mockedToggle.checked);
    window.__app = {
      version: "1.2.0-facility-crud-map-placement",
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
