# Privacy and security

- CSV import is local-only. `File.text()` parses the selected file in browser memory; no request contains file contents.
- Imported records are not placed in localStorage, IndexedDB, cookies, URL parameters, analytics, or the feature service.
- Reloading the page clears imported records.
- The repository ignores `*.csv`; the INTERNAL DRAFT source CSV is not committed or staged for Pages.
- The application is read-only and does not call editing endpoints.
- The OAuth client ID is a public application identifier. No client secret or token is stored in source or runtime config.
- Tokens are managed by ArcGIS IdentityManager and are not logged or exposed through `window.__app`.
- Invented demo records are explicitly labeled and are available only when the live service cannot be loaded.

Production operators should confirm the configured portal, service sharing, OAuth redirect registration, county center, organizational privacy policy, and CDN/content-security-policy requirements before release.
