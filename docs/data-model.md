# Data model

## Current service records

Resources and Facilities retain the complete ArcGIS attributes object and geometry. A display adapter uses case-insensitive field-name hints for names, department, category, quantity, and status because the runtime service schema may evolve. Current metrics remain separate from imported estimates.

## Imported preview records

The documented twelve-column CSV shape is normalized into:

- identity: `id`, `assetType`, `department`, `category`
- planning: quantity range and midpoint, availability, EOC role, status, priority, operator domain, gap, unit-cost range, notes
- provenance: `source`, `sourceType`, `locationMethod`, `isMockLocation`
- display geometry: exactly one point per input record

Quantity and unit-cost ranges preserve raw text, minimum, maximum, and midpoint estimate. A record with quantity 100 still creates one map point.

## Location hierarchy

1. Match normalized asset type against current resource attributes; department/category increase confidence.
2. Match normalized department against current facility attributes.
3. Generate a stable point around the configured county center using a deterministic record hash.

Coverage is `(resource matches + facility matches) / imported records`. It is labeled **coverage**, never accuracy. Mocked points are visually distinct and can be hidden.

The reported fleet total of 1,465 is an unverified benchmark shown outside current and imported totals.
