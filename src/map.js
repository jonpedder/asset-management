import { inferFieldBindings } from "./asset-editing.js";
import { inferFacilityBindings } from "./facility-editing.js";

let Graphic;
let GraphicsLayer;
let view;
let map;
let importedLayer;
let mockedLayer;
let demoLayer;
let placementPreviewLayer;
let serviceLayers = [];
let selectHandler = () => {};
let pointSelection = null;

const symbols = {
  imported: { type: "simple-marker", style: "circle", size: 10, color: "#f2a900", outline: { color: "#071824", width: 1.5 } },
  mocked: { type: "simple-marker", style: "x", size: 12, color: "#ff6b6b", outline: { color: "#ffdadf", width: 1 } },
  demo: { type: "simple-marker", style: "diamond", size: 11, color: "#8bd3ff", outline: { color: "#071824", width: 1.5 } },
  demoFacility: { type: "simple-marker", style: "square", size: 13, color: "#36b37e", outline: { color: "#071824", width: 1.5 } },
  placementPreview: { type: "simple-marker", style: "circle", size: 18, color: [242, 169, 0, 0.35], outline: { color: "#f2a900", width: 3 } }
};

export async function initializeMap(config, onSelect) {
  if (config.resourceColors) {
    symbols.imported.color = config.resourceColors.imported || symbols.imported.color;
    symbols.mocked.color = config.resourceColors.mocked || symbols.mocked.color;
    symbols.demo.color = config.resourceColors.demo || symbols.demo.color;
  }
  const [Map, MapView, GraphicClass, GraphicsLayerClass] = await $arcgis.import([
    "@arcgis/core/Map.js",
    "@arcgis/core/views/MapView.js",
    "@arcgis/core/Graphic.js",
    "@arcgis/core/layers/GraphicsLayer.js"
  ]);
  Graphic = GraphicClass;
  GraphicsLayer = GraphicsLayerClass;
  selectHandler = onSelect;
  map = new Map({ basemap: config.map.basemap });
  importedLayer = new GraphicsLayer({ id: "imported-validated", title: "Imported — validated location" });
  mockedLayer = new GraphicsLayer({ id: "imported-mocked", title: "Imported — mocked location" });
  demoLayer = new GraphicsLayer({ id: "invented-demo", title: "Invented demo data" });
  placementPreviewLayer = new GraphicsLayer({ id: "facility-placement-preview", title: "Unsaved facility placement preview", listMode: "hide" });
  map.addMany([demoLayer, importedLayer, mockedLayer, placementPreviewLayer]);
  view = new MapView({
    container: "mapView",
    map,
    center: [config.map.center.longitude, config.map.center.latitude],
    zoom: config.map.zoom,
    constraints: { snapToZoom: false },
    popup: { dockEnabled: true, dockOptions: { position: "bottom-right", buttonEnabled: true, breakpoint: false } }
  });
  await view.when();
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
    const layerId = graphic.layer?.id;
    const objectIdField = graphic.layer?.objectIdField;
    const objectId = objectIdField ? graphic.attributes[objectIdField] : graphic.attributes.OBJECTID ?? graphic.attributes.objectid;
    if (objectId != null && layerId === "resources") selectHandler(`service-resource-${objectId}`);
    if (objectId != null && layerId === "facilities") selectHandler(`service-facility-${objectId}`);
  });
  window.__esriView = view;
  window.__esriMap = map;
  window.__esriLayers = { imported: importedLayer, mocked: mockedLayer, demo: demoLayer, facilityPlacementPreview: placementPreviewLayer };
  return { map, view };
}

function servicePopupTemplate(layer, kind) {
  const bindings = kind === "resource"
    ? inferFieldBindings(layer.fields || [])
    : inferFacilityBindings(layer.fields || [], layer.objectIdField);
  const preferredKeys = kind === "resource"
    ? ["assetType", "department", "category", "quantityRaw", "availability", "status", "priority", "locationName", "address", "city", "state", "zip", "notes"]
    : ["name", "type", "status", "department", "address", "city", "state", "zip", "notes"];
  const used = new Set();
  const fieldInfos = preferredKeys.map((key) => bindings[key]).filter((name) => name && !used.has(name) && used.add(name)).map((name) => {
    const field = layer.fields.find((candidate) => candidate.name === name);
    const numeric = ["integer", "small-integer", "double", "single", "float"].some((part) => String(field?.type || "").toLowerCase().includes(part));
    return { fieldName: name, label: field?.alias || name, ...(numeric ? { format: { places: 0, digitSeparator: true } } : {}) };
  });
  if (!fieldInfos.length) {
    for (const field of layer.fields || []) {
      const type = String(field.type || "").toLowerCase();
      if (field.name === layer.objectIdField || type.includes("geometry") || type.includes("blob") || type.includes("raster")) continue;
      fieldInfos.push({ fieldName: field.name, label: field.alias || field.name });
      if (fieldInfos.length === 10) break;
    }
  }
  const titleField = kind === "resource" ? bindings.assetType : bindings.name;
  return {
    title: titleField ? `{${titleField}}` : layer.title,
    content: [
      { type: "text", text: kind === "resource" ? "<b>Resource inventory record</b>" : "<b>Facility inventory record</b>" },
      { type: "fields", fieldInfos }
    ],
    fieldInfos
  };
}

export async function addServiceLayers(config) {
  const FeatureLayer = await $arcgis.import("@arcgis/core/layers/FeatureLayer.js");
  removeServiceLayers();
  const resourceLayer = new FeatureLayer({
    id: "resources",
    title: "Resources",
    url: `${config.serviceUrl}/${config.layers.resources}`,
    outFields: ["*"],
    popupEnabled: true
  });
  const facilityLayer = new FeatureLayer({
    id: "facilities",
    title: "Facilities",
    url: `${config.serviceUrl}/${config.layers.facilities}`,
    outFields: ["*"],
    popupEnabled: true
  });
  map.addMany([facilityLayer, resourceLayer], 0);
  await Promise.all([resourceLayer.load(), facilityLayer.load()]);
  resourceLayer.popupTemplate = servicePopupTemplate(resourceLayer, "resource");
  facilityLayer.popupTemplate = servicePopupTemplate(facilityLayer, "facility");
  serviceLayers = [resourceLayer, facilityLayer];
  window.__esriLayers.Resources = resourceLayer;
  window.__esriLayers.Facilities = facilityLayer;
  return { resourceLayer, facilityLayer };
}

function removeServiceLayers() {
  serviceLayers.forEach((layer) => map?.remove(layer));
  serviceLayers = [];
}

function graphicFor(record, symbol) {
  return new Graphic({
    geometry: record.geometry,
    symbol,
    attributes: {
      recordId: record.id,
      title: record.assetType || record.name,
      source: record.source,
      category: record.category || record.type || "Not provided",
      department: record.department || "Not provided",
      status: record.status || "Unknown",
      quantity: record.quantity?.raw || "Not provided",
      address: [record.locationName, record.address, record.city, record.state, record.zip].filter(Boolean).join(", ") || "Not provided",
      location: record.locationMethod || (record.geometry ? "Mapped location" : "No geometry")
    },
    popupTemplate: {
      title: "{title}",
      content: [{ type: "fields", fieldInfos: [
        { fieldName: "category", label: record.assetType ? "Category" : "Facility type" },
        { fieldName: "department", label: "Department" },
        { fieldName: "status", label: "Status" },
        ...(record.assetType ? [{ fieldName: "quantity", label: "Quantity" }] : []),
        { fieldName: "address", label: "Address" },
        { fieldName: "location", label: "Location status" },
        { fieldName: "source", label: "Source" }
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

export function clearDemo() {
  demoLayer?.removeAll();
}

export function setMockedVisible(visible) {
  if (mockedLayer) mockedLayer.visible = visible;
}

export function setPlacementPreview(geometry) {
  placementPreviewLayer?.removeAll();
  if (geometry) placementPreviewLayer?.add(new Graphic({ geometry, symbol: symbols.placementPreview, attributes: { preview: true } }));
}

export function clearPlacementPreview() {
  placementPreviewLayer?.removeAll();
}

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
