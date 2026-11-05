# Privacy and security

- CSV import is parsed locally. Normalized imported records and their explicit edits are stored only in `sessionStorage` for the current tab/session.
- Imports are not bulk geocoded or uploaded. Supplied address text is preserved until an operator explicitly chooses Locate address and Save changes.
- Current resource features can be updated only after sign-in, an update-capability check, an object-ID check, validation, and an explicit Save changes action. Updates use `FeatureLayer.applyEdits`; the app does not construct tokenized REST requests.
- Address preview geocoding requests `forStorage=false`. A second, explicit save-time geocode requests `forStorage=true` only when its result will be persisted. Geocoding and service edits can consume services or credits and require appropriate permission.
- Facilities are dropdown/reference data only and are never editable.
- The repository ignores `*.csv`; source CSV files are not committed or staged for Pages.
- The OAuth client ID is a public application identifier. No client secret or token is stored in source or runtime config.
- Tokens are managed by ArcGIS IdentityManager and are not logged or exposed through `window.__app`.
- Invented demo records are explicitly labeled and cannot be saved.

Production operators should confirm the configured portal helper geocoder, service editing/sharing, OAuth redirect registration, organizational privacy policy, credit policy, and CDN/content-security-policy requirements before release.
