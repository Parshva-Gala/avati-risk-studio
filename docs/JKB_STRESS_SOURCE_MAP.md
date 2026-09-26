# JKB stress source and implementation map

Read-only audit of the user-designated `C:\Tools\JKB Stress Testing - VBA & Builds` on 27 September 2026. This is an original workflow/schema synthesis. No source workbook, proprietary VBA implementation, customer record or bank calibration is included here. No macros, recovery scripts or external model jobs were executed.

## Sources and version boundaries

| Inspected asset | What it establishes | Boundary |
|---|---|---|
| `VBA modules (exported 13 Sep 2026)` | `Sheet1.bas` navigation, report formatting/formula editor; `ThisWorkbook.bas` startup, selection toggles and button rebinding | Contains worksheet/workbook classes, not the complete standard-module calculation/build implementation |
| `ST_Automate.zip` → `scenario_builder_all_macros_v4_2.zip` | Seven `modScenarioBuilder_*` modules, `README_IMPORT.txt`, manifest and combined audit copy; external batch report generator v4.2 | Separate older source/config contract; do not mix its module set with V14 |
| `JKB_V14_VBA_and_Recovery.zip` | Complete scenario builder, independent pre-shock/reconciliation engines, source joining, manual report generation, reviewed formula corrections, shared report/UI modules and recovery/build harness | A prepared workbook also holds rules and review state; VBA alone is not the entire model |
| `JKB_Stress_Testing_Tool.xlsm`, `JKB_Stress_Testing_V14.xlsm`, `ST_VBA_Automate.xlsm` | Parallel workbook-structure inspection by the workbook-adapter agent | Numeric contents remain local. Cached outputs are not proof that an independent recalculation passed |

The top-level ZIP inventory contains an automation workbook inside `ST_Automate.zip`. The V14 recovery ZIP contains a manual-report template, rules workbook, standard/class modules, build/recovery scripts and shared UI/report modules. These are assets to inspect and map, not frontend dependencies to execute or publish.

The workbook-structure inspection found 90 sheets in the newer Tool/V14 workbooks and 70 in the older automation workbook. `Scenario Element Output` uses header row 3, a blank-severity bank base at row 4 and scenario data from row 5 in the newer pair. The older workbook uses header row 1, base row 2 and data from row 3. Its very large formatted range must not be mistaken for populated records. The newer Tool has cleared source/evidence sheets while V14 retains local input/cache/evidence content. These observations justify header detection, populated-row scanning and explicit source-version reporting in the importer.

## Main dashboard and navigation

The inspected source uses the sheet names `Dashboard` and `Recon_Workbench`; it does not establish a sheet literally named `MainDashboard`.

| Surface / exact reference | Source procedure | User workflow to preserve |
|---|---|---|
| `Dashboard!N1` marker `MASTER`; upload button `F8:J10` | Exported `Sheet1.EnsureRibbon`, `UploadScenarioOutput` | Load testcase system output before choosing report coverage |
| `Dashboard!F12:J13`, `F14:J15` | `BuildAllScenarioSheets`, `ResetGeneratedOutputs` | Choose/generate output packs; explicitly reset generated output |
| `Dashboard!B8:C9`, `B11:C12` | `Sheet1.GoConfig`, `Sheet1.GoFormat` | Inspect calculation configuration separately from presentation settings |
| `Recon_Workbench!B9`, `E9`, `H9`, `K9` | V14 `modReconWorkbench.EnsureReconWorkbench`, `UpdateReconSummary` | Run state, verified checks, differences and missing/review counters |
| `Recon_Workbench!B15:D18`, `E15:G18`, `H15:J18`, `K15:M18` | `EnsureReconWorkbench` | Four preparation cards: source extracts, system output, filter conditions, shock design |
| `Recon_Workbench!B20:D21`, `E20:G21`, `H20:J21`, `K20:M21` | `UploadAllSources`, `UploadScenarioOutput`, `GoPreShockCases`, `ShowShockCatalog` | Open the relevant preparation action directly |
| `Recon_Workbench!B12:G13`, `H12:J13`, `K12:M13` | `BuildManualReconPack`, `ShowReconExceptions`, `RunStressReconciliation` | Build the complete manual pack, inspect exceptions, or rerun comparisons without rebuilding the full pack |
| `Recon_Workbench!C26`, `F26` | `ReadTolerance`, `FieldTolerance` | Separate amount and rate absolute tolerances in the field's stored unit |
| `Recon_Workbench!B29:M30`, `K35:M36` | Run/error handlers, `ExportReconEvidence` | Latest activity and evidence export; failed runs leave earlier results identified as a prior snapshot |

`ThisWorkbook.Workbook_Open` initializes the tool; sheet activation refreshes navigation. `Workbook_SheetBeforeDoubleClick` toggles Yes/No in selection columns A/D/G/J from row 7. These are navigation and selection behaviors, not financial calculations.

## Scenario taxonomy: categories, cases, elements and severities

These are separate dimensions. A category groups test cases; a case contains shock elements; an element has a formula family and zero or more available severity records. A generic three-preset slider panel does not represent this hierarchy.

The older v4.2 `modScenarioBuilder_ExternalRun.ExtCategoryFromTestCaseCode` uses these exact prefixes:

| Prefix | Category |
|---|---|
| `CR` | Credit Risk |
| `CC` | Climate |
| `GP` | Geopolitical |
| `COR` | Concentration |
| `LR` | Liquidity |
| `MEF` | MEF |
| `MR` | Market |
| `OR` | Operational |
| `AS` | Additional |

Unmapped prefixes are logged rather than assigned an invented category. Source severities are **Moderate, Medium and Severe**. `ExtGetManualFormulaText` selects the corresponding configured severity formula, falling back to the default only when that override is empty. These slots are not projection years. The inspected output-selection procedures do not define a user-selected multiyear forecast horizon; as-of date is source identity. RiskCube's annual PD projection horizon is a distinct contract.

V14 `modScenarioBuilder_EntryPoints.StartScenarioCategorySelection` builds `Generate_Output`: category choices in A:B, dates D:E, entities G:H and cases J:L, with hidden identity columns N:Q. Headers precede row 7; Yes/No data starts at row 7. `ReadSelections` requires at least one item in each list; `IsSelected` intersects all four lists. `GenerateOutputs` blocks an empty available intersection. The UI must not create a synthetic Cartesian product of missing source records.

### Shock-family inventory

V14 `modReconSetup.InstallShockCatalog` writes `Shock_Catalog!A7:G7` as family, field, design definition, source reference, review status, reviewed formula and review note. The first occurrence of each family in column A is below. These are catalog entries, not a claim that every family is configured or approved.

| Catalog family | First exact cell | Distinct workflow/model concern |
|---|---|---|
| Base case | `Shock_Catalog!A8` | Bank-wide starting metrics separate from filtered pre-shock population |
| Specific customers becomes NPA | `A104` | Named/customer-selected credit deterioration and stage/ECL consequences |
| Specified portfolio segment moves from performing to NPA | `A210` | Segment selection, migration and conserved gross outstanding |
| Increase in NPA percentage of segment | `A314` | Proportionate segment migration, not a portfolio-wide PD multiplier |
| Exchange rates changing | `A419` | Currency-sensitive scope and FX-specific amounts |
| Interest rate change | `A504` | Rate-sensitive asset/liability scope and the documented bucket policy |
| Market Price Change of Bonds and Stocks | `A571` | Security-price exposure and loss transmission |
| Change in profits | `A650` | Profit, tax and regulatory-capital transmission |
| Specified Percentage of Deposits are Withdrawn | `A730` | Deposit outflow and legal-liquidity/LCR effects |
| Limit Drawdown | `A752` | Commitment conversion, credit/liquidity consequences |
| Change in Value of Liquid Assets | `A773` | Asset-value changes, without inventing liability/outflow impacts |
| Specific customers withdraw deposits | `A789` | Customer concentration selection and deposit withdrawal |
| Specific customers draw down limits | `A811` | Customer-specific commitment selection; not configured in this V14 release |
| Specific loss | `A830` | Explicit loss with profit/capital effects |
| ALM Factor Revision | `A910` | Factor-policy revision; not configured in this V14 release |
| Deposit increase or withdrawn without change in liquid assets | `A926` | Deposit/liability movement with unchanged liquid-asset assumption |

The V14 README describes 13 configured shock families, while customer-specific limit drawdown and ALM factor revision remain unconfigured. It also identifies the macroeconomic approach as needing executable model specifications. Preserve the difference between a documented design family, available source output, configured formula and independently verified calculation. Selecting the MEF category alone does not supply a macroeconomic model.

## Source and calculation contracts

`modScenarioBuilder_Core.ReadSource` detects the output header within the first 50 rows. Its required identity fields are `AS_OF_DATE`, `ENTITY_ID`, `ENTITY_CODE`, `RUN_ID`, `SCENARIO_TEST_CASE_CODE`, `SCENARIO_ELEMENT_CODE`, `ELEMENT_TYPE`, `SEVERITY_CODE` and `AMOUNT_CHANGE`. Additional configured measures can be required by the selected family. `IndexSource` maintains reporting-date/entity/case/element/severity identity and rejects conflicting duplicates, element types and filter definitions. V14 accepts exact duplicate source records; this is a version-specific policy, not permission to sum duplicate outputs.

`Config_ElementTypeRules!tblElementTypeRules` is loaded by `modScenarioBuilder_Config.LoadRulesByElementType`. Its contract includes element type, enabled flag, output order/label, source field, default and per-severity manual formulas, visibility, difference display, formats and notes. Formula configuration is separate from `Config_MasterFormatting`. A web implementation should use explicit reviewed operations and retain source references; it should not execute arbitrary imported VBA or Excel formulas.

V14 `modScenarioBuilder_PreShock` defines `Pre_Shock`, `Pre_Shock_Sources`, `Pre_Shock_Metrics`, `Pre_Shock_Fields`, `Pre_Shock_Cases`, `Pre_Shock_Results` and derived-value/breakdown views. Common layout: title row 3, purpose row 4, status row 6, header row 7, data from row 8. `Pre_Shock_Metrics` column J records value-source policy: derived input, system output, or derived-else-system. Strict independent reconciliation must disclose that policy and must not call copied system values independent evidence.

| Source family | Owned facts | Independence requirement |
|---|---|---|
| ECL | Account balances, stages and credit-loss measures | Source measures, reporting date and selected account population |
| CAPRWA | Deal-level RWA/exposure | Stage and case population; do not substitute aggregate capital-file rows |
| LL | Legal-liquidity cashflows | PRE-factor asset measures and POST-factor liability measures in the shipped default policy |
| LCR | Liquidity-coverage cashflows | PRE-factor HQLA and POST-factor inflow/outflow measures in the shipped default policy |
| CAP | Base regulatory capital components | Exact component codes; bank-wide base, not deal-level testcase amounts |

References: `modScenarioBuilder_Multi.SeedMetricsLiquidity`, `SeedMetricsCapital`, `SourceBankFilter`, `EntityFilterFor`; `modScenarioBuilder_Folder.UploadInputFolder` and `IdentifyAndLoad`. Bank identity and branch scope are distinct filters. The inspected JKB scope distinguishes Jordan, Cyprus and both; that is not a universal interpretation for every visual bank theme. Date mismatches, unknown bank identity, blank measures and unresolved account dimensions remain explicit blockers/review items.

`ImportScenarioRules` uses case/element/condition records. Exact matching and unique-element fallback have different review status. Literal source `NULL` can mean explicit ALL within eligible scope; missing definitions are not equivalent to ALL. ALL also does not implement top-customer ranking. The original case condition, editable override, match mode and matched-row count must remain visible.

## Automation steps and resulting outputs

### v4.2 external output builder

`README_IMPORT.txt` gives the macro order: `ValidateScenarioBuilderSetup` → `VerifyExternalOutputPatchV42` → `BuildAllScenarioSheets`. The first two validate setup/output writing; they are not stress-result approval.

`RunExternalScenarioOutput` loads configuration and source headers, builds the case/element/severity registry, creates a unique run folder under `Output`, processes selected categories/cases, records each generated/failed result and then writes the run summary/log. `ExtGenerateTestCaseWorkbook` creates each case workbook. `ExtWriteTestCaseRunDetailsHeader` creates `Run_Details`: run identity at B3, timestamp B4, category B7, case code/name B9:B10, element table A12:G12 and separate source run IDs for each severity. `ExtWriteRunSummaryWorkbook` creates `Run_Summary.xlsx` with `Summary`, `Generated_Files`, `Run_Log`; companion outputs are `Run_Log.csv` and `Run_Summary.txt`.

### V14 generation and independent reconciliation

1. **Inspect selected source coverage.** `GenerateOutputs` reads/indexes source, loads rules/grouping, validates view settings and intersects category/date/entity/case selections. Invalid selected rules block generation.
2. **Prepare independent base/pre-shock values.** `PrepareBaseTestCache` and derived-value references preserve calculation lineage. The ordinary generator has an explicit channel for unavailable independent checks and can continue with configured manual formulas; successful generation alone is therefore not PASS.
3. **Build side-by-side element reports.** `modScenarioBuilder_ExternalRun.BuildElement` uses A for metric, B for base, C:E for system Moderate/Medium/Severe, F:H for independent/manual values, I:K for differences. Group headings are row 5, severity headings row 6, data from row 7. Missing severity blocks are hidden; missing/error values are not turned into a zero difference. `Derived_Values` provides traceable references instead of unexplained pasted answers.
4. **Run strict reconciliation.** `modReconWorkbench.RunStressReconciliationQuiet` enables `ReconStrictMode`, validates sources/rule coverage, rebuilds base/pre-shock results and each shock calculation, then writes `Recon_Detail`. `CompareValue` returns BLOCKED for unavailable expected/system values and FAIL when absolute difference exceeds the field's amount/rate tolerance. Formula review and dependency proof are checked separately through `FormulaProof` and `ReviewIssue`.
5. **Build the complete manual pack.** `BuildManualReconPackTo` runs reconciliation, creates a calculation checkpoint, calls `BuildJoinedInputTo`, then `Ps_BuildManualReportsTo`. Errors preserve failure context; the intermediate checkpoint is removed after a successful pack.
6. **Review exceptions and export evidence.** `ShowReconExceptions` opens unresolved items. `ExportReconEvidence` exports value snapshots of the workbench, detail, catalog, rule register, source/metric configuration and derived values. It strips interactive shapes rather than claiming the export executes the model.

`Recon_Detail!A7:R7` defines the review grain: status, stage, as-of date, entity, testcase, element, severity, field, expected, system, difference, tolerance, calculation, reason/next action, source, filter, selected rows and run timestamp. Difference is system minus expected. A valid zero, a missing measure, an empty population and an unsupported calculation are distinct outcomes.

### Reports the application should expose

| Source artifact / procedure | Review question |
|---|---|
| Element sheets from `BuildElement` | What are the base, system, manual and difference values at each severity? |
| `Run_Details`, `Run_Summary.xlsx`, CSV/text logs | Which cases/elements were selected, generated, failed or absent? |
| `Joined_Input.xlsx`: `Joined_Data`, `Base`, `Base_<source>`, case pivots | Which eligible source facts contributed to this case? |
| `Source_Controls`, `Case_Coverage` in joined output | Did joining conserve each source's own amounts, and was the intended population actually covered? |
| `Base_Reconciliation`, `Reconciliation`, `Base_vs_PreShock`, `By_Metric` | Do bank base and selected pre-shock calculations agree at their proper grain? |
| `Where_It_Breaks`, `Manual_Calcs`, `Pivot_Checks`, `Why`, `Data` | Why did a result differ or remain unavailable, and which source dimensions/formulas explain it? |
| `Case_...` sheets and `Index` from `modScenarioBuilder_Manual.BuildWorkbook` / `WriteIndex` | Can a reviewer navigate directly to one case/element/date/entity? |
| Evidence export from `ExportReconEvidence` | What source, scope, formula review and calculation state supported this captured review? |

`modScenarioBuilder_Joined` retains `ROW_SOURCE` and `SOURCE_ROW_NUMBER`; ECL can enrich other facts with dimensions, but must not copy its balances onto their cashflow/RWA records. Case pivots include only eligible matched rows. Empty populations receive coverage notices, not an unfiltered fallback. Different metrics and repeated bank bases must not be summed together into misleading grand totals.

## Formula corrections and unresolved semantics

`modReconSetup.ApplyConfirmedCorrections` logs changes in `Formula_Changes!A7:F74` and guards the known prior/target formula before replacing it. This preserves customized definitions for review. Examples that affect any new engine implementation:

- `Config_ElementTypeRules!J138` and `J146`: liquid-asset-value shocks do not imply legal-liability or LCR outflow changes.
- `J140`, `J1659`, `J1943`, `J1955`: the source impact convention for those ratio fields is base minus stressed ratio; a generic delta convention cannot be applied indiscriminately.
- `J1733`: segment migration to NPA conserves gross outstanding.
- `J1768:J1769`: independently derived credit-loss impact reduces base profit before tax, while tax rate retains its reconciled base value.
- `J1954`: net-outflow impact is outflow impact less inflow impact; it must not automatically assume inflows always equal the regulatory cap.

These references demonstrate the need for field-specific operations and controls. They do not resolve every source conflict or authorize unreviewed bank calibration. Formula review attaches to the exact formula displayed, and data/dependency checks still run afterward.

The parallel engine inspection identified the prepared `JKB_Stress_Testing_Tool.xlsm` configuration as the primary calculation mapping; generated example sheets can retain stale formulas. Its `Config_ElementTypeRules` cells add these specific implementation requirements:

| Prepared-workbook reference | Required interpretation |
|---|---|
| `J718`, `J712` | Interest-rate PBT transmission uses the rate-sensitive asset/liability gap and a basis-point shock; the related operational-RWA change uses the documented income averaging and conversion factors. A percent/fraction slider is not an interchangeable input |
| `J414`, `J422` | FX RWA uses the absolute percentage shock; PBT also accounts for credit-loss and net-open-position changes |
| `J1475` | Specific loss is an amount-driven PBT impact, separate from a percentage change in profit |
| `J1718:J1719`, `J1744` | Performing-stage migration requires stage-specific shares and the configured stressed-default loss ratio |
| `J1768`, `J1777` | Incremental credit loss affects PBT; the Tier 2 bridge separately reflects the Stage 1 ECL movement |
| `J1650`, `J1653`, `J1656` | Percentage deposit withdrawal has separate selected HQLA/outflow impacts and a zero inflow impact in this configuration |
| `J1946`, `J1949` | The no-liquid-asset-change deposit family preserves HQLA and applies its signed percentage to selected outflow |

These prepared-workbook observations were supplied by the parallel source-formula review. An implementation should retain its method/version alongside any declared improvements, such as conservative tax treatment without deferred-tax-asset recognition and unavailable ratios for zero denominators. It must not silently describe those improvements as literal workbook parity.

## Gap analysis and implementation priorities

The audit baseline was the existing `src/pages/Stress.tsx` with baseline/adverse/severe presets, six portfolio-level drivers and a single capital bridge. Its calculations remain useful for generic planning, but that surface did not provide the source tool's scenario registry, workbook import, native output comparison, case populations or automation/report workflow. RiskCube's connected facility chain is a foundation; it is not evidence that these additional JKB workflows are already implemented.

| Priority | Deliverable | Minimum acceptance evidence |
|---|---|---|
| P0 | Native workbook output adapter and provenance | Detect actual header/base/data layout; preserve date/entity/case/element/family/severity identity and source row; reject conflicting duplicates and invalid units; never execute workbook code |
| P0 | Scenario workbench replacing generic-only navigation | Category → case → element → severity selection, source status, editable supported shock parameters and explicit unsupported families; no fabricated source combinations |
| P0 | Reviewed family-specific calculation contract | Distinguish source observation, independent recalculation, assumption and unsupported result; exact inputs/formulas for NPA, FX/rate/market, profit/loss and liquidity families; preserve source sign/unit conventions |
| P0 | Base → population → pre-shock → shock → post-shock comparison | Per-field system/manual/difference; amount/rate tolerance; PASS/FAIL/BLOCKED; missing never zero; no circular proof by copying system results |
| P1 | Input/source and rule coverage | ECL/CAPRWA/LL/LCR/CAP ownership, bank/date/branch scope, exact/fallback rule match, selected/review/excluded row counts, explicit overrides |
| P1 | Batch run and report library | Selected coverage, progress/failed cases, same-run identity, complete input snapshot, source/case drill-down, independent totals and report export |
| P1 | Cube/Pivot/report connection | Reviewed supported outputs flow into a documented shared contract; imported observations remain labeled observations; cross-module totals reconcile without double-counting |
| P2 | Wider source parity | Ranking policies, unconfigured customer drawdown/ALM revision and calibrated MEF execution only when their required specifications/data exist |

Work ownership during this review: the stress-engine agent owns explicit family calculations/contracts, the workbook agent owns safe XLSM/XLSX data import, and the root agent owns the new Stress UI and app integration. This map is a source-backed acceptance checklist, not a claim that all listed priorities have shipped.
