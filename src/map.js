let Graphic;
let GraphicsLayer;
let view;
let map;
let importedLayer;
let mockedLayer;
let demoLayer;
let serviceLayers = [];
let selectHandler = () => {};

const symbols = {
  imported: { type: "simple-marker", style: "circle", size: 10, color: "#f2a900", outline: { color: "#071824", width: 1.5 } },
  mocked: { type: "simple-marker", style: "x", size: 12, color: "#ff6b6b", outline: { color: "#ffdadf", width: 1 } },
  demo: { type: "simple-marker", style: "diamond", size: 11, color: "#8bd3ff", outline: { color: "#071824", width: 1.5 } },
  demoFacility: { type: "simple-marker", style: "square", size: 13, color: "#36b37e", outline: { color: "#071824", width: 1.5 } }
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
  map.addMany([demoLayer, importedLayer, mockedLayer]);
  view = new MapView({
    container: "mapView",
    map,
    center: [config.map.center.longitude, config.map.center.latitude],
    zoom: config.map.zoom,
    constraints: { snapToZoom: false },
    popup: { dockEnabled: true, dockOptions: { position: "bottom-right", buttonEnabled: false } }
  });
  await view.when();
  view.on("click", async (event) => {
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
  window.__esriLayers = { imported: importedLayer, mocked: mockedLayer, demo: demoLayer };
  return { map, view };
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

export function clearDemo() {
  demoLayer?.removeAll();
}

export function setMockedVisible(visible) {
  if (mockedLayer) mockedLayer.visible = visible;
}

export function focusRecord(record) {
  if (!record?.geometry || !view) return;
  view.goTo({ target: record.geometry, zoom: Math.max(view.zoom, 13) }, { duration: 500 }).catch(() => {});
}
