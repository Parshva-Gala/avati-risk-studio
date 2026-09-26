# Delivery verification

Verified on 27 September 2026 using synthetic data only.

## Automated checks

`node --test tests/*.test.mjs`: **85 passed, 0 failed**.

Coverage includes hand-calculated ECL and survival, staging and borrower contagion, probability weights, capital conservation, ESG evidence and taxonomy gates, deduplicated emissions attribution, native RiskCube projection mapping and yearly curve coverage, connected drawdown/EAD/RWA/liquidity identities, connected Pivot aggregation, input rejection, snapshot identity/provenance, storage recovery, CSV safety and XLSX round trips.

`node node_modules/typescript/bin/tsc -b`: passed.

`node node_modules/vite/bin/vite.js build`: passed. Main JavaScript is approximately 387 KB before gzip; the approximately 1,035 KB workbook chunk loads only when Excel import/export is requested. Vite reports its standard large-chunk advisory for that optional dependency.

## Browser checks

- Visited all analytical pages and inspected the four bank themes; theme changes preserve calculations.
- Checked the eight main navigation routes at 390 × 844. No horizontal document overflow or NaN values; wide tables and the calculation lineage retain their own scroll containers. Reset the temporary viewport afterward.
- Connected the built-in synthetic RiskCube-format export: 44 source rows cover all 18 facilities. A Manufacturing-scoped disorderly-transition run passed all eight reconciliation identities.
- The run displayed approximately USD 67.46m incremental ECL, 8.92% capital ratio and 85.43% liquidity proxy. Imported-curve reporting ECL was USD 113.648m in both the connected view and the IFRS 9 calculation.
- Invalid ECL scenario weights blocked capture until repaired. Connected Pivot controls showed PASS for matching data, FAIL for an altered value and BLOCKED for a missing key.
- Saved Stress, RiskCube, ECL and connected Pivot captures survived reload. Inspected native curve provenance and the facility period trace.
- Exercised the Excel review action and verified the downloaded workbook. The in-app browser's download-event observer timed out, but the named file was present in Downloads and was read back independently.
- Development hot-reload errors during concurrent edits were corrected before the passing TypeScript and production builds.

## Boundaries

These are implementation and synthetic-workflow checks, not bank model validation or regulatory certification. No live RiskCube database job was executed. No production dataset, bank credentials or private document is included.

The separate original Midbank workbook repair has a rebuilt XLSM and source-driven visual previews in [PR #1](https://github.com/Parshva-Gala/Alm-manual-report-builder/pull/1). Its build validation found no issues. Native Excel smoke validation could not run under this device's script execution policy; that policy was not changed.
