# JKB stress-testing integration

The Stress lab now opens the JKB workbench. The previous six-driver capital calculator remains under **Quick sensitivity**. This integration was built by inspecting `JKB_Stress_Testing_Tool.xlsm`, `JKB_Stress_Testing_V14.xlsm`, `ST_VBA_Automate.xlsm` and their exported/recovery source.

## Working flow

1. Choose a mechanism from the scenario library and Moderate, Medium or Severe. These are independent same-date cases, not an invented multi-year forecast.
2. Review the pre-shock position. Shared-portfolio mode takes credit exposures and calibrated ECL from the common facility/RiskCube engines. Capital, market and funding inputs are separate, editable amounts in USD millions. Depositor concentration has its own depositor population, not the lending borrower table.
3. Trace the post-shock exposure, stage migration, ECL, profit, CET1, AT1, Tier 2, credit/market/operational RWA, capital ratios, HQLA, flows, legal liquidity, ASF and RSF. Both input movements and source formula references are visible.
4. Reconcile identities and, for a native case, compare with stored system outputs. Missing values are BLOCKED, actual differences are FAIL, and checks never offset different rows.
5. Capture the assessment in Reports, export Excel/CSV/JSON, or use **Pivot Desk → JKB stress assessment**. Metric views separate ratios from amounts and do not sum unrelated bank ratios or balance-sheet metrics.

## Thirteen configured mechanisms

| Mechanism | Key transmission |
|---|---|
| Existing NPA growth | Transfer from performing stages against starting NPA stock |
| Performing-to-NPA migration | Release performing allowance, recognize default loss and move stage exposure/RWA |
| Borrower concentration | Rank borrower groups, apply contagion across their facilities |
| Foreign-exchange translation | Selected exposure translation, net open-position P&L and FX RWA |
| Interest-rate gap | RSA minus RSL earnings sensitivity, with the source operational-RWA link |
| Bond/equity price | Signed price change through market-value P&L |
| Specific operational loss | Signed amount through profit and capital |
| Profit change | Signed proportional/amount change through earnings |
| Deposit runoff | Selected liquidity/ASF/RSF contributions change independently |
| Depositor concentration | Ranked depositor withdrawal or native preselected customer aggregate |
| Limit drawdown | Cash use, incremental EAD after CCF, ECL and stable funding |
| Liquid asset depletion | Selected assets/HQLA/inflows change; liabilities remain fixed |
| Deposit change without assets | Selected liabilities/outflows/funding change; assets remain fixed |

Signs and units follow the mechanism: negative fixed amount is a loss; negative price return is a decline; positive FX shock means local currency appreciation; the rate gap control displays basis points. Default numbers are synthetic and are not bank calibration.

## Native workbook bridge

Declare the source currency and amount scale, then load `.xlsm` or `.xlsx`. The parser reads only workbook metadata, shared strings and the fixed **Scenario Element Output** table. It does not execute VBA, hidden automation source, external connections or formulas. Formula caches are rejected. Sparse parsing handles old workbooks with over one million formatted empty rows.

The two current local builds each expose **137 unique cases** and one bank baseline; the older automation file exposes **160 cases**. Four exact duplicate rows in the current builds are collapsed with an explicit warning; conflicting duplicates block import. Select as-of date, entity, scenario and severity before applying a native element.

Mapping replaces inputs with source values and leaves missing fields unknown. Applying a case can therefore require completion of bank profit, tax, funding or policy parameters absent from that extract. Required gaps are highlighted and block capture. Optional unrelated fields remain unknown. No missing input inherits a synthetic value from the prior scenario.

Native amounts stay in the declared currency and scale. They are never silently joined to the USD-million facility master. Only matching same-date/entity/scenario/element severity observations are used for native comparison; other observations require separate selection. Source row/cell references and manual input declarations remain attached to a captured assessment.

## Interpretation and scope

The [source map](JKB_STRESS_SOURCE_MAP.md) records the inspected workbook/automation versions and exact references. Generated source reports contain formula defects and diverge from some configured rules. The web engine follows the documented semantic rules, with explicit method extensions and warnings; it does not assert byte-for-byte replication of every legacy report.

The liquidity sensitivities retain the source's uncapped HQLA/(outflows−inflows) and ASF/RSF calculations. They are not complete regulatory LCR/NSFR engines. Drawdown credit/CCF/RSF transmission is an explicit shared-engine extension. No tax credit is assumed on losses, and Tier 2 allowance changes do not perform regulatory eligibility/cap tests. Normalized portfolio USD currency is not an original-denomination FX flag; portfolio FX scope is an explicit sensitivity assumption.

The two unconfigured native families—customer-specific limit drawdown and ALM factor revision—are not invented. The legacy five-source raw-data join/reconciliation automation and Excel macro report generator are not run by this browser edition. Native result import, independent recalculation, output reconciliation and portable review are implemented locally.

All repository fixtures are synthetic. Private bank workbooks and imported browser data are excluded from GitHub.
