# Privacy and security

- CSV import is parsed locally. Normalized imported records and their explicit edits are stored only in `sessionStorage` for the current tab/session.
- Imports are not bulk geocoded or uploaded. Supplied address text is preserved until an operator explicitly chooses Locate address and Save changes.
- Current resource features can be updated only after sign-in, an update-capability check, an object-ID check, validation, and an explicit Save changes or Apply facility action. Bulk facility assignment validates the complete selection first and sends selected service assets in one `FeatureLayer.applyEdits({ updateFeatures })` batch before changing any selected imports. ArcGIS can still return partial service results; the app reports exact success/failure counts and does not mark failed edits successful. The app does not construct tokenized REST requests.
- The clearly labeled Locate action performs address preview geocoding with `forStorage=false` and fills visible read-only latitude/longitude fields. Map picking fills the same preview fields without geocoding. A second, explicit save-time geocode requests `forStorage=true` only when an address-mode result will be persisted. Geocoding and service edits can consume services or credits and require appropriate permission.
- Facility, City, and ZIP filters are browser-side only. Bulk assignment copies a loaded facility's available location text and geometry to selected assets. Signed-in facility add/update/remove operations are separate explicit service writes gated by capabilities, schema, object ID, and geometry compatibility. Removal warns about referencing assets and never removes or reassigns them. Imported bulk changes remain in strict `sessionStorage`; demo records are rejected.
- The repository ignores `*.csv`; source CSV files are not committed or staged for Pages.
- The OAuth client ID is a public application identifier. No client secret or token is stored in source or runtime config.
- Tokens are managed by ArcGIS IdentityManager and are not logged or exposed through `window.__app`.
- Invented demo records are explicitly labeled and cannot be saved.

Production operators should confirm the configured portal helper geocoder, service editing/sharing, OAuth redirect registration, organizational privacy policy, credit policy, and CDN/content-security-policy requirements before release.
