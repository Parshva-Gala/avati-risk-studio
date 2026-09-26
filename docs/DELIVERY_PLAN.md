# Avati Risk Studio delivery plan

## Goal

Deliver a runnable Avati application centered on an integrated RiskCube: one portfolio connects ESG context, native exported PD curves, explicit scenario transmission, ECL, capital, RWA, liquidity, Pivot Desk and reconciliation. Preserve the useful workflows from Avati ESG, Midbank PivotDesk, native RiskCube, JKB/JCB stress workbenches and NBI IFRS 9 research, and publish the original implementation in a new GitHub repository. Also repair the original PivotDesk workbook's secondary-page experience.

## Tasks and acceptance criteria

1. **Review source applications and bank references.** Preserve useful workflows and calculation boundaries. Synthesize requirements; do not copy confidential documents, bank records, customer tables or unverified calibrations.
2. **Create a shared design system.** Midbank emerald, JKB light blue, JCB ivory/teal and NBI midnight/gold must style navigation, hierarchy, hero panels, cards, tables, forms, charts, dialogs and reports. Themes cannot change model results.
3. **Connect the portfolio and model calibration.** Validate imports before replacement; use one versioned facility master across modules with monetary fields in USD millions. Import native `PROJECTED_PD_YEARWISE` exports with explicit bank/date/scenario selection, calendar years, units, annual conditional PD confirmation and exact segment/country mapping. Require full facility/maturity coverage and preserve source provenance.
4. **Complete the analytical chain.** Join borrower ESG/evidence context; apply explicit global macro and scoped climate/drawdown assumptions; calculate starting, stressed and separately weighted reporting ECL with the shared annual-curve engine. Pass incremental ECL to capital once, incremental EAD to RWA and drawdowns to liquidity outflows. Reconcile facility, sector and financial bridge totals. Empty scope intersections and missing calibration must block connected execution.
5. **Connect the working views.** The same imported annual curves feed IFRS 9 and Stress lab. Pivot Desk defaults to current RiskCube outputs, with portfolio metrics available separately; scenario changes flow into pivots and key-level reconciliation. Keep scores, evidence, taxonomy claims, credit assumptions and reporting measures distinct. Missing data remains distinguishable from zero.
6. **Preserve reviewability.** Saved runs retain complete inputs and results; RiskCube snapshots include native rows, selection, curves, consistent run identity and provenance. Offer per-snapshot XLSX review sheets, complete snapshot JSON, a whole-library JSON review pack, summary CSV and print. Portable workspace JSON includes settings/history for validated restore. Label locally declared reviews honestly.
7. **Verify.** Meaningful hand calculations, source-curve transmission, missing-coverage, scope, serialization and malformed-input tests; TypeScript/build checks; browser checks of connected workflow, routes, themes, saved reports, persistence and mobile layout.
8. **Publish.** Commit tested source, documentation, synthetic examples and reproducible build instructions to `Parshva-Gala/avati-risk-studio`. Publish the original workbook fix as a separate reviewable PR.

## Edition boundary

This delivery is a local analytical application with a functioning connected calculation chain and transparent simplified models. It consumes exported native model results; it does not call the native background execution API, write to bank databases or claim a live RiskCube backend connection. Source yearwise PD interpretation still requires confirmation and independent validation. No confidential bank documents or customer records are bundled.

Enterprise identity, server-side entitlements, governed native job execution, signed approvals, encrypted evidence storage, approved bank-specific mappings, full cashflow/calibration models and regulatory liquidity calculations require a separate deployment and validation project. Bank themes change the complete visual experience, never risk parameters or source model identity.

## Original PivotDesk fix

Published separately: [PR #1](https://github.com/Parshva-Gala/Alm-manual-report-builder/pull/1). The rebuilt XLSM and source-driven previews are included. Native Excel smoke validation was unavailable because the device's script execution policy rejected the smoke script; the policy was not changed.
