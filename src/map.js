let Graphic;
let GraphicsLayer;
let view;
let map;
let webmap = null;
let importedLayer;
let mockedLayer;
let demoLayer;
let placementPreviewLayer;
let serviceLayers = [];
let resourceServiceLayer = null;
let facilityServiceLayer = null;
let homeViewpoint = null;
let selectHandler = () => {};
let pointSelection = null;

const symbols = {
  imported: { type: "simple-marker", style: "circle", size: 10, color: "#f2a900", outline: { color: "#071824", width: 1.5 } },
  mocked: { type: "simple-marker", style: "x", size: 12, color: "#ff6b6b", outline: { color: "#ffdadf", width: 1 } },
  demo: { type: "simple-marker", style: "diamond", size: 11, color: "#8bd3ff", outline: { color: "#071824", width: 1.5 } },
  demoFacility: { type: "simple-marker", style: "square", size: 13, color: "#36b37e", outline: { color: "#071824", width: 1.5 } },
  placementPreview: { type: "simple-marker", style: "circle", size: 18, color: [242, 169, 0, 0.35], outline: { color: "#f2a900", width: 3 } }
};

function canonicalLayerUrl(url, layerId) {
  const clean = String(url || "").split("?")[0].replace(/\/+$/, "");
  const match = clean.match(/^(.*\/(?:FeatureServer|MapServer))(?:\/(\d+))?$/i);
  if (!match) return clean.toLowerCase();
  const id = match[2] ?? (layerId == null ? "" : String(layerId));
  return `${match[1]}/${id}`.replace(/\/+$/, "").toLowerCase();
}

function findWebMapLayer(serviceUrl, layerId) {
  const target = canonicalLayerUrl(serviceUrl, layerId);
  const layers = map?.allLayers?.toArray?.() || map?.layers?.toArray?.() || [];
  return layers.find((layer) => canonicalLayerUrl(layer.url, layer.layerId) === target) || null;
}

function fieldMatch(layer, aliases) {
  const normalized = aliases.map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return (layer.fields || []).find((field) => {
    const candidates = [field.name, field.alias].filter(Boolean).map((value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, ""));
    return candidates.some((candidate) => normalized.includes(candidate));
  });
}

function popupTemplateFor(layer, kind) {
  const definitions = kind === "resource"
    ? [["Asset type", ["asset type", "asset", "resource type", "equipment type", "name"]], ["Department", ["department", "dept", "agency", "division", "owner"]], ["Category", ["category", "asset category", "resource category", "class"]], ["Quantity", ["quantity", "estimated quantity", "est qty", "qty", "count"]], ["Status", ["status", "operational status", "condition"]], ["Facility", ["facility", "facility name", "site", "site name"]]]
    : [["Facility name", ["facility name", "site name", "location name", "name", "title"]], ["Type", ["facility type", "site type", "type", "category"]], ["Status", ["facility status", "operational status", "status", "condition"]], ["Department", ["department", "dept", "agency", "division", "owner"]], ["Address", ["street address", "address 1", "address", "street"]], ["City", ["city", "municipality", "town"]], ["State", ["state", "province", "region"]], ["ZIP", ["zip code", "postal code", "postcode", "zip"]]];
  const matched = definitions.map(([label, aliases]) => ({ label, field: fieldMatch(layer, aliases) })).filter((item) => item.field);
  const used = new Set(matched.map((item) => item.field.name));
  const safeFallbacks = (layer.fields || []).filter((field) => field.visible !== false && !used.has(field.name) && field.name !== layer.objectIdField && !/(oid|global-id|geometry|blob|raster|xml)/i.test(field.type || "")).slice(0, Math.max(0, 6 - matched.length));
  const fieldInfos = [...matched.map(({ label, field }) => ({ fieldName: field.name, label })), ...safeFallbacks.map((field) => ({ fieldName: field.name, label: field.alias || field.name }))];
  const titleField = fieldMatch(layer, definitions[0][1])?.name || layer.displayField || layer.objectIdField;
  return {
    title: titleField ? `{${titleField}}` : kind === "resource" ? "Asset" : "Facility",
    content: fieldInfos.length ? [{ type: "fields", fieldInfos }] : [{ type: "text", text: "No displayable attributes are available." }]
  };
}

function updateLegend() {
  const list = document.getElementById("mapLegendList");
  if (!list) return;
  list.replaceChildren();
  const entries = [
    [resourceServiceLayer, "legend-swatch-assets"],
    [facilityServiceLayer, "legend-swatch-facilities"],
    [importedLayer, "legend-swatch-imported"],
    [mockedLayer, "legend-swatch-mocked"],
    [demoLayer, "legend-swatch-demo"]
  ].filter(([layer]) => layer);
  for (const [layer, swatchClass] of entries) {
    const row = document.createElement("div");
    const swatch = document.createElement("span");
    const label = document.createElement("span");
    row.className = "map-legend-row";
    swatch.className = `map-legend-swatch ${swatchClass}`;
    label.textContent = layer.title;
    row.append(swatch, label);
    list.append(row);
  }
}

function updateBookmarks() {
  const select = document.getElementById("mapBookmarkSelect");
  if (!select) return;
  select.replaceChildren(new Option("Choose a bookmark", ""));
  const bookmarks = map?.bookmarks?.toArray?.() || [];
  bookmarks.forEach((bookmark, index) => select.add(new Option(bookmark.name || `Bookmark ${index + 1}`, String(index))));
  select.disabled = !bookmarks.length;
}

function bindMapControls() {
  homeViewpoint = view.viewpoint?.clone();
  document.getElementById("mapZoomIn")?.addEventListener("click", () => view.goTo({ zoom: view.zoom + 1 }).catch(() => {}));
  document.getElementById("mapZoomOut")?.addEventListener("click", () => view.goTo({ zoom: view.zoom - 1 }).catch(() => {}));
  document.getElementById("mapHome")?.addEventListener("click", () => homeViewpoint && view.goTo(homeViewpoint).catch(() => {}));
  document.getElementById("mapPopupDock")?.addEventListener("click", (event) => {
    const next = !view.popup.dockEnabled;
    view.popup.dockEnabled = next;
    event.currentTarget.setAttribute("aria-pressed", String(next));
    event.currentTarget.textContent = next ? "Dock" : "Float";
  });
  document.getElementById("mapBookmarkSelect")?.addEventListener("change", (event) => {
    const bookmark = map?.bookmarks?.getItemAt?.(Number(event.currentTarget.value));
    if (bookmark?.viewpoint) view.goTo(bookmark.viewpoint).catch(() => {});
  });
  updateLegend();
  updateBookmarks();
}

export async function initializeMap(config, onSelect) {
  if (config.resourceColors) {
    symbols.imported.color = config.resourceColors.imported || symbols.imported.color;
    symbols.mocked.color = config.resourceColors.mocked || symbols.mocked.color;
    symbols.demo.color = config.resourceColors.demo || symbols.demo.color;
  }
  const [Map, WebMap, Portal, MapView, GraphicClass, GraphicsLayerClass] = await $arcgis.import([
    "@arcgis/core/Map.js",
    "@arcgis/core/WebMap.js",
    "@arcgis/core/portal/Portal.js",
    "@arcgis/core/views/MapView.js",
    "@arcgis/core/Graphic.js",
    "@arcgis/core/layers/GraphicsLayer.js"
  ]);
  Graphic = GraphicClass;
  GraphicsLayer = GraphicsLayerClass;
  selectHandler = onSelect;
  const webmapItemId = String(config.map?.webmapItemId || "").trim();
  if (webmapItemId) {
    const portal = new Portal({ url: config.portalUrl });
    webmap = new WebMap({ portalItem: { id: webmapItemId, portal } });
    await webmap.load();
    await webmap.loadAll();
    map = webmap;
  } else {
    webmap = null;
    map = new Map({ basemap: config.map.basemap });
  }
  importedLayer = new GraphicsLayer({ id: "imported-validated", title: "Imported — validated location" });
  mockedLayer = new GraphicsLayer({ id: "imported-mocked", title: "Imported — mocked location" });
  demoLayer = new GraphicsLayer({ id: "invented-demo", title: "Invented demo data" });
  placementPreviewLayer = new GraphicsLayer({ id: "facility-placement-preview", title: "Unsaved placement preview", listMode: "hide" });
  map.addMany([demoLayer, importedLayer, mockedLayer, placementPreviewLayer]);
  const viewOptions = {
    container: "mapView",
    map,
    constraints: { snapToZoom: false },
    ui: { components: ["attribution"] },
    popup: { dockEnabled: true, dockOptions: { position: "bottom-right", buttonEnabled: true, breakpoint: false } }
  };
  if (!webmapItemId) Object.assign(viewOptions, { center: [config.map.center.longitude, config.map.center.latitude], zoom: config.map.zoom });
  view = new MapView(viewOptions);
  await view.when();
  bindMapControls();
  view.on("click", async (event) => {
    if (pointSelection) {
      const active = pointSelection;
      pointSelection = null;
      view.container?.classList.remove("map-pick-active");
      setPlacementPreview(event.mapPoint);
      active.resolve(event.mapPoint);
      return;
    }
    const response = await view.hitTest(event);
    const hit = response.results.find((result) => result.graphic?.attributes);
    if (!hit) return;
    const graphic = hit.graphic;
    if (graphic.attributes.recordId) {
      selectHandler(graphic.attributes.recordId);
      return;
    }
    const objectIdField = graphic.layer?.objectIdField;
    const objectId = objectIdField ? graphic.attributes[objectIdField] : graphic.attributes.OBJECTID ?? graphic.attributes.objectid;
    if (objectId != null && graphic.layer === resourceServiceLayer) selectHandler(`service-resource-${objectId}`);
    if (objectId != null && graphic.layer === facilityServiceLayer) selectHandler(`service-facility-${objectId}`);
  });
  window.__esriView = view;
  window.__esriMap = map;
  window.__esriWebMap = webmap;
  window.__esriLayers = { imported: importedLayer, mocked: mockedLayer, demo: demoLayer, facilityPlacementPreview: placementPreviewLayer };
  return { map, view, webmap };
}

export async function addServiceLayers(config) {
  const FeatureLayer = await $arcgis.import("@arcgis/core/layers/FeatureLayer.js");
  removeServiceLayers();
  const makeLayer = (kind, title, layerId) => {
    const existing = findWebMapLayer(config.serviceUrl, layerId);
    if (existing) return { layer: existing, owned: false };
    return { layer: new FeatureLayer({ id: kind, title, url: `${config.serviceUrl}/${layerId}`, outFields: ["*"], popupEnabled: true }), owned: true };
  };
  const resource = makeLayer("resources", "Resources", config.layers.resources);
  const facility = makeLayer("facilities", "Facilities", config.layers.facilities);
  const additions = [facility, resource].filter((entry) => entry.owned).map((entry) => entry.layer);
  if (additions.length) map.addMany(additions, 0);
  await Promise.all([resource.layer.load(), facility.layer.load()]);
  resource.layer.outFields = ["*"];
  facility.layer.outFields = ["*"];
  resource.layer.popupEnabled = true;
  facility.layer.popupEnabled = true;
  resource.layer.popupTemplate = popupTemplateFor(resource.layer, "resource");
  facility.layer.popupTemplate = popupTemplateFor(facility.layer, "facility");
  resourceServiceLayer = resource.layer;
  facilityServiceLayer = facility.layer;
  serviceLayers = [resource, facility];
  window.__esriLayers.Resources = resource.layer;
  window.__esriLayers.Facilities = facility.layer;
  updateLegend();
  updateBookmarks();
  return { resourceLayer: resource.layer, facilityLayer: facility.layer };
}

function removeServiceLayers() {
  serviceLayers.filter((entry) => entry.owned).forEach((entry) => map?.remove(entry.layer));
  serviceLayers = [];
  resourceServiceLayer = null;
  facilityServiceLayer = null;
}

function graphicFor(record, symbol) {
  return new Graphic({
    geometry: record.geometry,
    symbol,
    attributes: { recordId: record.id, title: record.assetType || record.name, source: record.source, location: record.locationMethod },
    popupTemplate: {
      title: record.assetType || record.name,
      content: [{ type: "fields", fieldInfos: [
        { fieldName: "source", label: "Source" },
        { fieldName: "location", label: "Location status" }
      ] }]
    }
  });
}

export function displayImported(records) {
  importedLayer.removeAll();
  mockedLayer.removeAll();
  for (const record of records) {
    const target = record.isMockLocation ? mockedLayer : importedLayer;
    target.add(graphicFor(record, record.isMockLocation ? symbols.mocked : symbols.imported));
  }
  if (records.length) view.goTo([...importedLayer.graphics, ...mockedLayer.graphics], { padding: 80 }).catch(() => {});
}

export function displayDemo(resources, facilities) {
  demoLayer.removeAll();
  resources.forEach((record) => demoLayer.add(graphicFor(record, symbols.demo)));
  facilities.forEach((record) => demoLayer.add(graphicFor(record, symbols.demoFacility)));
  view.goTo(demoLayer.graphics, { padding: 80 }).catch(() => {});
}

export function clearDemo() { demoLayer?.removeAll(); }
export function setMockedVisible(visible) { if (mockedLayer) mockedLayer.visible = visible; }
export function setPlacementPreview(geometry) {
  placementPreviewLayer?.removeAll();
  if (geometry) placementPreviewLayer?.add(new Graphic({ geometry, symbol: symbols.placementPreview, attributes: { preview: true } }));
}
export function clearPlacementPreview() { placementPreviewLayer?.removeAll(); }
export function cancelPointSelection(reason = "Map placement was canceled.") {
  if (!pointSelection) return false;
  const active = pointSelection;
  pointSelection = null;
  view?.container?.classList.remove("map-pick-active");
  active.reject(new Error(reason));
  return true;
}
export function startPointSelection() {
  cancelPointSelection("A new map placement replaced the previous selection.");
  if (!view) return Promise.reject(new Error("The map is not ready."));
  view.container?.classList.add("map-pick-active");
  return new Promise((resolve, reject) => { pointSelection = { resolve, reject }; });
}
export function focusRecord(record) {
  if (!record?.geometry || !view) return;
  view.goTo({ target: record.geometry, zoom: Math.max(view.zoom, 13) }, { duration: 500 }).catch(() => {});
}
