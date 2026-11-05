# Asset Management

Static operational resource and facility inventory with browser-local CSV staging and carefully gated asset editing.

## Features

- ArcGIS Maps SDK for JavaScript 5.1 CDN with `$arcgis.import`
- Anonymous service access attempt plus optional full-page ArcGIS OAuth redirect sign-in
- Editable Resources (layer 0) when authorized and supported; Facilities (layer 1) remain reference-only
- Accessible inventory table with combined search/source/facility/city/ZIP filters, persistent checkbox selection, details, map selection, and source provenance
- Explicit bulk facility assignment for imported and authorized service assets; one service `applyEdits` batch, partial-result reporting, and no facility edits
- Robust local CSV parsing and normalization; no CSV upload or persistence
- Location hierarchy: current resource match, facility match, deterministic mocked county point
- Distinct imported/mocked symbology and mocked-point visibility control
- Invented demo data available only after the operational service cannot load
- Settings & Help page with browser-local branding, labels, colors, connection diagnostics, and startup defaults
- Dependency-free, branded Help & How-to PDF generation in the browser
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

Runtime public configuration is in `config/app.json`. The OAuth client ID is a public identifier, not a secret. Asset Management uses a full-page authorization-code redirect to the registered canonical URL `https://jonpedder.github.io/asset-management/`. This avoids popup/opener failures during Entra or ArcGIS sign-in. The dedicated callback remains registered for future popup use, but the current flow does not depend on it. The existing Resource & Asset Management application is not modified.

The fallback center is configured to an approximate San Mateo County map center. It is used only to create clearly labeled deterministic mock points when no resource or facility geometry can be matched; it is not an operational asset location.

## Privacy and data safety

Import begins in Settings. CSV text is parsed locally and discarded; normalized records and imported edits, including bulk facility assignment, remain in `sessionStorage` for the current tab/session. Imports are not bulk geocoded or uploaded. A signed-in operator can explicitly save or bulk-assign current resources only when the FeatureLayer reports update support and every selected feature has an object ID. Bulk service updates use one `FeatureLayer.applyEdits` batch and report partial results; mixed selections change imports only after complete service success. Facilities are never editable. Address geocoding and service saves can consume services or credits and require permission.

## Build and deployment

`npm run build` deletes and recreates `site/`, copying only `index.html`, `oauth-callback.html`, `src/`, `styles/`, and the public runtime `config/app.json`. GitHub Pages deploys only `site/`; tests, docs, scripts, workflow source, and local files are not published.

See [architecture](docs/architecture.md), [data model](docs/data-model.md), and [privacy](docs/privacy.md).
