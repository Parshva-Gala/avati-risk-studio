# Delivery verification

Verified on 27 September 2026. Calculation tests use synthetic data. The three local JKB workbooks were also read without executing macros; their bank data remains local and is not included in this repository.

## Automated checks

`node --test tests/*.test.mjs`: **124 passed, 0 failed**.

Coverage includes hand-calculated ECL and survival, staging and borrower contagion, probability weights, capital conservation, ESG evidence and taxonomy gates, deduplicated emissions attribution, native RiskCube projection mapping and yearly curve coverage, connected drawdown/EAD/RWA/liquidity identities, connected Pivot aggregation, input rejection, snapshot identity/provenance, storage recovery, CSV safety and XLSX round trips. JKB coverage adds 13 shock mechanisms, native case identity and baseline matching, signed shocks and rate units, explicit missing inputs, output reconciliation, version-specific workbook reading and saved assessment validation.

`node node_modules/typescript/bin/tsc -b`: passed.

`node node_modules/vite/bin/vite.js build`: passed. Main JavaScript is approximately 480 KB before gzip. Workbook handling loads optional chunks (approximately 939 KB for Excel import/export and 96 KB for ZIP reading). Vite reports its standard large-chunk advisory for the optional Excel dependency.

## Browser checks

### JKB workbench follow-up

- Read the actual Tool and V14 workbooks: each yielded 137 unique scenario cases and one baseline. The older Automation workbook yielded 160 cases and one baseline. Empty formatted rows did not become observations.
- Loaded V14 through the browser workbook bridge, filtered the native case by scenario and severity, and applied it. The input view explicitly blocked calculation on missing bank parameters instead of supplying synthetic defaults. Stored system outputs remained separately labeled snapshots.
- Checked independent Moderate / Medium / Severe outcomes for credit migration, rate changes and deposit withdrawal. The severe synthetic deposit withdrawal changed LCR to approximately 158.16% and NSFR to 111.36%, with seven calculation identities passing.
- Saved JKB Stress and ratio-only JKB Pivot captures; confirmed both appeared in Reports and survived browser reload with earlier captures retained.
- Checked all four stress views at 390 × 844: no horizontal document overflow or NaN values. Reset the temporary viewport afterward.
- Inspected the JKB light-blue and Midbank workbench presentations. The active model remains independent of the bank theme.

### Existing connected workspace checks

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

The latest ALM/Pivot default-branch reference is `5c12edfbb53c19454e6fe9b07e19142114ed0406` (Report filters, following the top-customer build performance fix). The separate original Midbank workbook repair incorporates that revision in [PR #1](https://github.com/Parshva-Gala/Alm-manual-report-builder/pull/1), head `d77294e6e8959b1538e56ca7f47fe050679a3676`. Its rebuilt XLSM and source-driven visual previews passed build validation with zero problems. The PR remains draft and unmerged. Native Excel smoke validation could not run under this device's script execution policy; that policy was not changed.

The JKB integration implements browser calculations and native case/output ingestion. It does not execute the source VBA batch generator or claim complete legacy workbook parity; unsupported raw-source joins and two unconfigured source mechanisms are documented in [JKB_STRESS.md](JKB_STRESS.md).
