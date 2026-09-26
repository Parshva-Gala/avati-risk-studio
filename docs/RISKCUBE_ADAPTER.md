# RiskCube backend contract and connected export adapter

This review inspected the existing Flask IFRS modelling source without reading environment secrets, connecting to a database, invoking an execution endpoint or starting a job. The application implements a **read-only export bridge**, not a live service connection.

## Inspected call and data map

| Layer | Observed contract |
| --- | --- |
| Execution request | `POST /avati/ifrs/mef/modelequation`; JSON fields `bankId`, `ifrsModelUpdationDate`, `mefDate`, `userId`, `methodType`. Allowed method types are `MEF`, `PD` and `PD_ITER`. |
| Immediate response | HTTP 202 means accepted and a background thread was started. It is not completion and does not deliver calculated PD rows. The envelope contains `status`, `errors`, `data`, `data_list`, `count`, `data_a_list_flag`, `message`. |
| Dispatch | MEF forecasting; segment-configured Vasicek, linear or logistic PD modelling; linear/logistic model iterations. |
| Segment/configuration | Bank and model-date configuration links IFRS segments to methods and economic-factor/period settings. Segment identifiers are not assumed to be industry labels. |
| Macro transformation | Selected periods, proportionality/log transforms, optional standardization/outlier treatment, configured lag shifts, mean-reversion/autoregression/moving-average forecasting and scenario-specific factor paths. Regression output uses the selected factors, coefficients and constants. |
| PD output | `PROJECTED_PD_PERIODWISE` uses `PERIOD_ID`; `PROJECTED_PD_YEARWISE` uses `PERIOD_YEAR`. Primary context keys are `BANK_ID`, `IFRS_MODEL_UPDATION_DATE`, `MEF_DATE`, `SCENARIO_ID`, `IFRS_SEGMENT_ID`. Some paths carry `COUNTRY_ID`; inspected regression yearwise output can omit it. Value column is `PROJECTED_PD`. |
| More granular outputs | DPD-bucket and rating-based PIT output tables are distinct contracts and are not silently treated as segment-level PDs. |
| Execution state | `MODELLING_PROCESS_EXECUTION_STATUS` holds bank, MEF date, process, procedure, user, active flag and timestamps. Observed statuses are `STARTED`, `COMPLETED`, `ERROR`; process names distinguish MEF forecast, PIT forecast and model iteration. |
| Errors | Unsupported method returns HTTP 400. Calculation errors are logged and recorded in execution state; the original HTTP 202 cannot establish success. Source contains disabled authentication/concurrency checks in the examined route; these must be reviewed before any authenticated service integration. |

The source uses database reads and writes during imports/execution. Its Flask route is therefore not suitable for a browser health probe or a supposedly read-only calculation fetch. No HTTP output/status retrieval endpoint was found in the inspected blueprint. The source's loopback example names port 8089; no listener was observed there, and no Python/Waitress process was found during this inspection. Deployment availability has not been established. No network call was made.

## Adapter input

`buildRiskCubeProjection(facilities, rows, selection)` consumes rows parsed from a `PROJECTED_PD_YEARWISE` export. Column spelling follows the existing backend:

`BANK_ID, IFRS_MODEL_UPDATION_DATE, MEF_DATE, SCENARIO_ID, IFRS_SEGMENT_ID, COUNTRY_ID, PERIOD_YEAR, PROJECTED_PD`

IDs can be strings or numbers. Dates accept ISO calendar dates or midnight SQL/ISO timestamp forms. `COUNTRY_ID` may be absent/empty for an explicitly global model. `PERIOD_YEAR` is a calendar year, not a relative period number. Quarterly `PERIOD_ID` values cannot be passed as years.

Selection requires `bankId`, `modelDate`, `mefDate`, `scenarioId`, `firstYear`, `pdUnit` (`fraction` or `percent`) and `pdBasis` (`annual-conditional`). A `segmentMap` optionally maps a facility ID, or its sector, to `{segmentId,countryId}`. Facility-specific entries take precedence. Without a map, the sector must exactly match the source segment and the source must have a global country boundary. Numeric country codes are never inferred from country names. Duplicate matching source keys fail validation, even if their values are identical.

The PD basis confirmation matters: inspected regression code aggregates periodwise outputs by arithmetic mean to produce yearwise rows. That table name alone does not establish the statistical interpretation or annualization of every configured model. Model owners must confirm that exported values are valid annual conditional PDs. Marginal/cumulative PD, quarterly PD, scaled bucket PD and already weighted scenarios need their own explicit conversion/mapping. Linear model outputs outside the valid probability range are rejected, not silently capped.

## Connected execution

Every facility needs all years from `firstYear` through its remaining tenor. Missing segments, countries or years block the entire projection bridge; there is no partial fallback to original master PD or last-year carry-forward. Coverage and missing-key details remain visible. On success the adapter emits `facilityCurves`, with relative `year` and fractional `annualPd` for each facility, and optional first-year-PD facility copies. Original input records are never modified.

RiskCube orchestration accepts these curves through `pdOverrides` and their context through `pdProvenance`. The chosen native scenario becomes the starting calibration for both the reference and stressed calculations. Additional macro and scoped climate changes are explicit overlays. Selecting a worst-case source and adding severe overlays is therefore a deliberately compound assumption, not a second independent source scenario.

Reporting ECL still uses the separate local accounting scenario weights and multipliers shown in the IFRS 9 workspace. This bridge does not import the upstream scenario weights or claim to reproduce the native engine's complete IFRS 9 result. Comparing results requires a matching probability, staging, curve and cash-flow contract.

Saved `cubeProjection` settings contain `{rows,selection}`. Coverage is recalculated against the current portfolio; replacing that portfolio may block a connected run without corrupting the previously saved export. Captured analyses preserve curves, mapping, bank/model/MEF dates, scenario, units and a change-detection fingerprint. The fingerprint and optional user-supplied `COMPLETED` status are provenance records, not authentication or proof of upstream execution.

All checked-in adapter examples and tests are synthetic. No original backend implementation, private bank coefficients, environment configuration or customer extracts are copied into this repository.
