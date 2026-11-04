import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "site");
const runtimeFiles = [
  "index.html", "settings.html", "oauth-callback.html", "config/app.json", "styles/app.css",
  "src/app.js", "src/auth.js", "src/config.js", "src/csv.js", "src/demo.js", "src/format.js",
  "src/help-pdf.js", "src/import-session.js", "src/location.js", "src/map.js", "src/normalize.js",
  "src/presentation.js", "src/service-data.js", "src/settings.js"
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
