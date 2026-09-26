# Connected RiskCube workflow

The connected run is an executable chain: **shared portfolio → segment selection → ESG evidence → macro and climate transmission → periodwise ECL → capital/RWA and liquidity → reconciled output contract**. It reuses the application's ECL, ESG and capital engines. An imported RiskCube PD projection replaces the starting PD curve used by that same chain. It is not a second disconnected calculator.

## Inputs and identity

`runCube(facilities, config, esgConfig, eclScenarios)` accepts the validated USD-million facility master and returns deterministic, serializable results. `runId`, `scenarioId`, `segmentId` and `asOf` identify the run. Sector and country selectors intersect; blank selectors mean the whole portfolio. `DEFAULT_CUBE_CONFIG` contains illustrative assumptions, not bank-calibrated values.

The reviewed local RiskCube modelling source uses a bank identifier, model update date, macroeconomic-factor date, scenario, IFRS segment, country and forecast period. The native `PROJECTED_PD_YEARWISE` data service reads projected PD by these modelling dimensions. The execution-status service tracks processes and procedure state. The application carries these concepts through exported-curve provenance and output identity; it does not copy database access code or credentials.

## One connected calculation

1. **Master and segmentation.** Validate the master and select the intersection of sector and country. Stage determination and borrower contagion use the shared credit engine across the entire portfolio, even if only part of it is in the climate scope.
2. **ESG evidence.** Join borrower assessments, financed emissions and review states using the common normalized borrower key. A borrower footprint is allocated across its facilities by drawn exposure, so sector totals do not double-count the inventory. The run date controls evidence validity. ESG score is context, not a calibrated PD coefficient.
3. **PD source.** Use the master annual conditional PD or a complete imported annual conditional curve. Imported curves must contain every facility, explicit IFRS segment/country mappings and contiguous forecast periods covering the entire remaining maturity. A native global-country projection explicitly uses `countryId: null`; it is preserved as global, never replaced by a facility country. No last-observation carry-forward, inferred source mapping or missing-period fallback is used.
4. **Scenario transmission.** A manual macro PD multiplier applies to the whole portfolio. A separate manual transition multiplier applies to the selected climate scope. PD is capped at 100%. A physical-risk assumption adds explicit LGD percentage points within scope, also capped at 100%. These assumptions must be supported by independent calibration before institutional use; ESG scores do not choose them.
5. **Exposure and liquidity link.** Scoped undrawn facilities are drawn at the selected fraction: drawn increases and undrawn decreases by the same amount. EAD increases by drawdown × (1 − CCF), rather than by the gross drawdown twice. The gross cash drawdown also enters liquidity outflows.
6. **ECL.** Starting and shocked portfolios use the same marginal-PD survival and discount calculation in `risk.mjs`. An imported annual curve is used year by year, including fractional final periods. Credit-impaired facilities retain the engine's explicit 100% default-PD treatment. Facility results retain their full starting and stressed period traces.
7. **Capital and RWA.** Only **stressed deterministic ECL − starting deterministic ECL** enters incremental credit losses. Market, income and operational assumptions are additional named loss components. The common capital bridge applies the same tax-benefit cap as Stress Lab. Stressed RWA equals starting RWA × (1 + uplift) plus incremental EAD × an explicit drawdown risk weight.
8. **Liquidity.** This planning ratio is HQLA after an explicit haircut divided by starting net outflows plus deposit runoff plus scoped facility cash drawdowns. Deposit runoff = deposit base × runoff rate. The haircut affects the numerator once; drawdowns affect outflows once. It is a simplified liquidity proxy, not a complete regulatory LCR engine: it does not implement all eligibility, cash-flow offsets, inflow caps, currency constraints or deposit classifications. The 100% review marker is a scenario display reference, not a determination of applicable regulatory requirements.
9. **Reconciliation.** Independent controls reconcile facility/sector ECL totals, the exact credit delta transferred to capital, EAD conversion, the capital bridge, RWA, liquidity outflows and financed-emissions allocation. ESG evidence gaps remain review items rather than automatically changing financial losses.

## Reporting ECL and stress ECL remain distinct

`baseline.ecl` is deterministic ECL under starting parameters. `stressed.ecl` is deterministic ECL under the selected macro/climate scenario. Their difference feeds capital exactly once. `reportingEcl` is a separate probability-weighted `calculateECL` result using the ECL module's scenario weights. Existing baseline or reporting provisions are not charged again to capital.

When a native RiskCube projection is imported, its selected native scenario is the **starting PD calibration** for all three results. Any macro or climate overlay is an additional user assumption. The imported scenario and modelling dates remain in `pdProvenance`, so selecting an already-stressed projection is visible rather than implicit.

## Return contract

- `context`: run, scenario, segment scope, date and PD-source provenance.
- `nodes`: ordered lineage steps with values, evidence status and explanations.
- `facilities`: scope, stage, base/stressed PD/LGD/EAD/ECL, drawdown, ESG context and complete period traces.
- `sectors`: aggregates that reconcile to the facility rows.
- `baseline`, `stressed`, `reportingEcl`: separately identified credit outputs.
- `capital`, `liquidity`: connected bridges and after-shock ratios.
- `checks`: expected, actual, difference and PASS/FAIL per numeric reconciliation.
- `contract`: `AVATI_CONNECTED_RISK_OUTPUT_V1`, a safe serializable integration payload with uppercase field names and explicit run identity.

The output contract is an application interchange schema, not a claim that an identically named database table exists. Native IFRS segment/country IDs are populated only from explicit validated projection mappings; local sector labels are retained separately. The actual bank interface requires an approved mapping and authenticated service adapter.

## Connection boundary

This version processes local data and validated RiskCube exports. It has not established or verified a live backend connection. `liveBackendConnected` is always false. No modelling endpoint is called, because the inspected service includes database-writing execution paths. Private documents, real customer records, credentials and local database connection configuration are excluded from the repository.

## Verification

Hand-calculated tests verify one credit delta entering capital, drawdown entering EAD/RWA/liquidity exactly once, native annual-curve survival math, scope isolation, no-shock invariance, weighted-reporting separation, borrower-footprint allocation and blocking of incomplete source projections. See `tests/cube.test.mjs` and [Risk methods](./risk-methods.md) for the shared engine's boundaries and official IFRS references.
