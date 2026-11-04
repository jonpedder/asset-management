# Architecture

## Runtime

The app is static HTML, CSS, and native ES modules. ArcGIS Maps SDK for JavaScript 5.1 is loaded from the Esri CDN and classes are resolved with `$arcgis.import`. There is no backend and no npm runtime dependency.

`src/app.js` owns state and UI orchestration. `auth.js` registers optional OAuth without forcing sign-in. `map.js` owns application-created map, view, service layers, and graphics layers. `service-data.js` performs complete object-ID batching and adapts unknown service field names. CSV parsing, normalization, and location assignment are pure modules with `node:test` coverage.

Required diagnostics globals are exposed after map initialization:

- `window.__esriView`
- `window.__esriMap`
- `window.__esriLayers`
- `window.__app`

## Access sequence

1. Load public runtime config.
2. Create the map and register OAuth configuration.
3. Reuse an existing signed-in session when available.
4. Otherwise probe layer metadata anonymously without credentials.
5. Load/query layers only when anonymous or authenticated access succeeds.
6. Offer sign-in and invented demo mode when service access fails.

No `applyEdits`, add, update, delete, upload, or persistence API is present.

## Build boundary

`scripts/build.mjs` stages an explicit allowlist into `site/`. GitHub Actions tests first, then builds and uploads only `site/` to Pages. Repository docs, tests, scripts, and source-control metadata are outside the deployed artifact.
