# Avati Risk Studio

**One portfolio. One connected risk picture.**

Avati Risk Studio connects portfolio and ESG context, model PD curves, scenario transmission, IFRS 9 expected credit loss, capital, liquidity, Pivot Desk and reconciliation in one working application. The central RiskCube view traces the same facilities through the full calculation chain. It combines ideas from the Avati ESG framework, Midbank's desk experience, native RiskCube, JKB/JCB stress workbenches and NBI IFRS 9 requirements.

## Run locally

Requires Node.js 22.13+ and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. For a production bundle:

```sh
pnpm test
pnpm build
pnpm preview
```

The application is static and uses no server account or remote data API. Its fonts and dependencies are bundled locally. Browser storage retains the workspace on this device and origin; use **Activity → Backup workspace** before moving browsers, clearing storage or changing ports. Do not open `dist/index.html` directly via `file://`; serve the build through `pnpm preview` or an HTTP static host.

## Connected modules

| Module | Working capabilities |
|---|---|
| The desk | Shared exposure, connected risk indicators, current ECL, ESG context, sector composition and review actions |
| RiskCube | Shared scenario and sector/country scope; annual PD curves → credit loss → incremental capital impact, RWA and liquidity; facility lineage and reconciled controls |
| Portfolio | CSV/XLSX template import, complete validation, search, filters, facility detail and export |
| ESG | Configurable E/S/G weights, borrower assessments, financed emissions attribution, evidence checks and taxonomy review |
| Stress lab | JKB workbench with 13 configured mechanisms, Moderate/Medium/Severe cases, native XLSM import, pre-/post-shock ECL/CET1/T2/RWA/P&L/LCR/NSFR traces, system-output reconciliation and shared RiskCube credit calibration |
| IFRS 9 | Shared imported annual PD calibration, probability-weighted scenarios, explicit stage reasons and borrower contagion, marginal PD survival, discounting and facility traces |
| Pivot Desk | Connected RiskCube starting/stressed ECL, incremental loss, stressed EAD and drawdown; optional portfolio metrics; sector/country/borrower grouping, filtering, Top N and CSV/XLSX exports |
| Reconciliation | Independent control CSV, exact keys, absolute tolerances and PASS/FAIL/BLOCKED outcomes |
| Reports | Saved input/result snapshots and same-module comparison; per-snapshot XLSX review, full snapshot JSON, whole-library JSON review pack, summary CSV and print output |
| Activity | Local change history, portable JSON backup and validated restore |

## Follow a connected run

Open **RiskCube** and choose a reference, adverse or disorderly-transition scenario. Select the sector/country intersection for climate overlays and drawdowns. Macro PD changes affect the whole portfolio; scoped transition PD, physical LGD and drawdown assumptions affect only matching facilities. ESG scores, financed emissions and evidence follow the borrowers as context; the app does not automatically convert an ESG score into a calibrated PD.

The same credit engine calculates starting ECL and stressed ECL. Their difference enters the capital bridge once. Drawdowns consume undrawn commitments, increase credit-converted exposure and RWA, and create liquidity outflow. Separate deposit runoff and HQLA assumptions complete the liquidity proxy. The probability-weighted reporting ECL remains a separate measure. Facility, sector, capital, RWA, liquidity and emissions identities accompany each run.

**Model bridge** accepts a native `PROJECTED_PD_YEARWISE` CSV export. Select the source bank ID, model date, MEF date, scenario, first calendar year, PD unit and exact segment/country mapping, then confirm annual conditional PD interpretation. Every facility needs every remaining maturity year. Missing coverage, duplicate rows and invalid units block the connection; no partial flat-PD fallback is applied. A synthetic export is available to exercise this workflow.

Connected curves become the starting calibration in **RiskCube, IFRS 9 and Stress lab**; each module retains its explicit scenario assumptions. **Pivot Desk** can aggregate the current connected scenario and reconcile its outputs. Captured RiskCube runs retain source rows, selection, provenance, annual curves, results and controls. See the [adapter contract](docs/RISKCUBE_ADAPTER.md) for native schema details and interpretation limits.

## JKB stress workbench

**Stress lab** now opens the source-derived JKB workflow: scenario library → pre-shock inputs → post-shock calculation → reconciliation. Import the native workbook through **Workbook bridge**, select its date/entity/scenario/severity, review the mapped inputs and compare independently calculated results with stored system outputs. The current Tool and V14 builds expose 137 unique native cases; the older automation build exposes 160. Missing source parameters stay visible and block calculation until completed.

Native amounts retain their declared currency and scale. Portfolio mode uses the same calibrated facility ECL as RiskCube; native mode uses the selected workbook position. **Pivot Desk → JKB stress assessment** provides metric-level views and controls, and captures flow into Reports. The prior simplified calculator remains under **Quick sensitivity**. See [JKB workflow and model boundaries](docs/JKB_STRESS.md) and the [inspected source map](docs/JKB_STRESS_SOURCE_MAP.md).

## Four complete visual themes

Use the bank selector at the top right. **Midbank** retains emerald surfaces, rounded navigation and a geometric hero. **JKB** uses light blue, crisp cards and structured controls. **JCB** uses ivory/teal, an editorial heading style and clear tab navigation. **NBI** uses midnight blue with gold detail and compact geometry. All pages use the shared components and theme tokens. These are Avati visual presets, not claims of bank endorsement. Theme selection never changes financial assumptions.

## Data contract

The initial 18-facility portfolio is entirely synthetic. Import exact headers from the downloadable template. Financial amounts (`balance`, `undrawn`, `enterpriseValue`, `revenue`) are **USD millions**; only normalized `USD` input is accepted. Rates (`pd`, `lgd`, `ccf`, `rate`) are fractions: `0.05` means 5%. `emissions` is tCO₂e. `years` is remaining maturity, allowing fractional years. `green` is a candidate flag, not a taxonomy decision.

Imports replace the master only after a valid preview and explicit Apply action. Existing saved reports keep their original inputs. Missing required values, nonfinite amounts, invalid rates, duplicate IDs and mixed currency units are rejected. Monetary conversion is intentionally explicit outside this input contract.

## Model and governance boundaries

This is a functioning **local planning and review application** with simplified, transparent models. It does not reproduce every source workbook, bank business rule or approved regulatory model.

- ECL uses constant bullet EAD and simplified staging; it is not an approved financial reporting calculation.
- Stress holds credit stages constant and uses explicit capital/RWA assumptions; its hurdle is a planning assumption.
- RiskCube provides local orchestration and an exported-model-output bridge. It does not run native Python/SQL jobs or claim a live backend connection. The inspected native API starts background database-writing model jobs and needs a separately governed service integration.
- Native yearwise output is not sufficient evidence of annual conditional PD interpretation. The importer requires that interpretation to be confirmed; cumulative or marginal PDs need conversion before import.
- The connected liquidity ratio is a simplified planning proxy, not a full regulatory LCR calculation.
- ESG scoring, E&S acceptability, taxonomy claims and emissions coverage remain distinct conclusions.
- Financed emissions implement a disclosed corporate attribution approximation, not the full PCAF asset-class standard.
- Locally entered owner/reviewer names are working-paper declarations, not authenticated maker/checker controls. Imported history is user-supplied.
- Browser storage is not encrypted enterprise evidence storage. There is no multiuser server, SSO, signed audit chain or regulated filing service.

See [risk methods](docs/risk-methods.md), [ESG methods](docs/esg-method.md), [RiskCube adapter](docs/RISKCUBE_ADAPTER.md), [source review](docs/SOURCE_REVIEW.md), [architecture](docs/ARCHITECTURE.md), [delivery plan](docs/DELIVERY_PLAN.md) and [verification](docs/VERIFICATION.md).

## Original PivotDesk workbook

The separate Midbank workbook UI repair is available in [Alm-manual-report-builder PR #1](https://github.com/Parshva-Gala/Alm-manual-report-builder/pull/1), including the rebuilt workbook. It applies the Desk's hero, workflow cards, toolbar and navigation to the working sheets while preserving existing data coordinates.
