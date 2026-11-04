# Asset Management

First-release static MVP for read-only operational resource and facility inventory, mapping, and browser-local CSV preview.

## Features

- ArcGIS Maps SDK for JavaScript 5.1 CDN with `$arcgis.import`
- Anonymous service access attempt plus optional ArcGIS OAuth popup sign-in
- Read-only Resources (layer 0) and Facilities (layer 1) inventory and geometry
- Accessible inventory table, search, details, map selection, and source provenance
- Robust local CSV parsing and normalization; no CSV upload or persistence
- Location hierarchy: current resource match, facility match, deterministic mocked county point
- Distinct imported/mocked symbology and mocked-point visibility control
- Invented demo data available only after the operational service cannot load
- Allowlisted `site/` build artifact for GitHub Pages

## Local development

Requirements: Node.js 20+ and a static web server. No npm packages are required.

```bash
npm test
npm run build
npx serve site
```

Opening `index.html` directly with `file://` is unsupported because modules and config are fetched over HTTP.

## Configuration

Runtime public configuration is in `config/app.json`. The OAuth client ID is a public identifier, not a secret. Its `popupCallbackUrl` deliberately remains fixed to the already-registered callback in `jonpedder/resource-asset-management`; this repo does not modify that registration or the old application.

The fallback center is configured to an approximate San Mateo County map center. It is used only to create clearly labeled deterministic mock points when no resource or facility geometry can be matched; it is not an operational asset location.

## Privacy and data safety

The application implements no feature-service edits. Imported CSV text and normalized records remain in memory for the current browser page and are cleared on reload. `.gitignore` excludes CSV files, and the source draft is not included.

## Build and deployment

`npm run build` deletes and recreates `site/`, copying only `index.html`, `oauth-callback.html`, `src/`, `styles/`, and the public runtime `config/app.json`. GitHub Pages deploys only `site/`; tests, docs, scripts, workflow source, and local files are not published.

See [architecture](docs/architecture.md), [data model](docs/data-model.md), and [privacy](docs/privacy.md).
