import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "site");
const runtimeFiles = [
  "index.html", "settings.html", "oauth-callback.html", "config/app.json", "styles/app.css",
  "src/app.js", "src/auth.js", "src/config.js", "src/csv.js", "src/demo.js", "src/format.js",
  "src/help-pdf.js", "src/import-session.js", "src/inventory-operations.js", "src/location.js", "src/map.js", "src/normalize.js", "src/asset-editing.js", "src/facility-editing.js",
  "src/presentation.js", "src/service-data.js", "src/facility-resource-summary.js", "src/import-geocoding.js", "src/settings.js", "src/resource-symbols.js", "src/facility-symbols.js", "src/table-sort.js", "src/panel-resize.js",
  "assets/resource-icons/biohazard.svg", "assets/resource-icons/bolt.svg", "assets/resource-icons/boxes-stacked.svg", "assets/resource-icons/building-shield.svg",
  "assets/resource-icons/droplet.svg", "assets/resource-icons/facility-management.svg", "assets/resource-icons/fire-extinguisher.svg", "assets/resource-icons/helmet-safety.svg", "assets/resource-icons/kit-medical.svg",
  "assets/resource-icons/magnifying-glass-location.svg", "assets/resource-icons/paw.svg", "assets/resource-icons/people-roof.svg", "assets/resource-icons/shield-halved.svg",
  "assets/resource-icons/tower-broadcast.svg", "assets/resource-icons/truck-fast.svg", "assets/resource-icons/FONT-AWESOME-LICENSE.txt"
];

await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });

for (const relative of runtimeFiles) {
  const destination = join(site, relative);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(root, relative), destination);
}

const html = await readFile(join(site, "index.html"), "utf8");
if (!html.includes('<script type="module" src="https://js.arcgis.com/5.1/"></script>')) {
  throw new Error("ArcGIS Maps SDK 5.1 module loader is missing.");
}
const stagedFiles = [];
async function walk(path, prefix = "") {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const relative = join(prefix, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) await walk(join(path, entry.name), relative);
    else stagedFiles.push(relative);
  }
}
await walk(site);
if (stagedFiles.some((file) => /(^|\/)(tests|docs|\.github|scripts)(\/|$)/.test(file))) {
  throw new Error("Non-runtime files entered the site artifact.");
}
await writeFile(join(site, ".nojekyll"), "", "utf8");
console.log(`Built site/ with ${stagedFiles.length + 1} allowlisted runtime files.`);
