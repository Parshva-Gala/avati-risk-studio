# Risk calculation methods

This workspace provides an explainable research and demonstration model. It is not an approved IFRS 9 engine, a regulatory capital model, or a substitute for a bank's signed-off policies. All shipped records and calibrations are synthetic. Bank themes change presentation only. Amounts are USD millions; PD, LGD, CCF, discount rates and scenario weights are fractions.

## Official reference material

- The IFRS Foundation's [IFRS 9 Financial Instruments standard overview](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-9-financial-instruments/) is the authoritative starting point for the standard and its implementation materials.
- The IFRS Foundation's [Forward-looking information and multiple scenarios educational webcast](https://www.ifrs.org/news-and-events/news/2016/07/25-webcast-on-ifrs-9/) discusses non-linearity, consistency of scenarios and probability-weighted credit-risk assessment. It is educational support, not a replacement for the standard.
- [IFRS 9, paragraphs B5.5.43–B5.5.44](https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2022/issued/part-a/ifrs-9-financial-instruments.pdf?bypass=on) distinguish the 12-month default window from the lifetime cash shortfalls conditional on that default, and discuss discounting to the reporting date. The constant-LGD demo treats LGD as the full conditional loss severity; it does not construct the underlying lifetime recovery cash flows.

These sources explain the governing concepts. They do not validate this implementation, its assumed PD/LGD parameters, scenario weights or staging policy.

## Expected credit loss

1. Validate required numbers, unique facility IDs and borrower identifiers. Missing values never become zero.
2. Stage 3 applies at 90 or more days past due. Stage 2 applies at 31–89 days or for a watchlist flag. Other facilities are Stage 1. Apply the worst stage across facilities sharing the same normalized borrower identifier; show both the facility trigger and contagion reason.
3. EAD = drawn balance + undrawn balance × CCF. This demo treats the result as a constant bullet exposure. The balance should already be net of any institution-specific adjustments.
4. Stage 1 uses the shorter of one year and contractual maturity. Stage 2 uses remaining lifetime. Stage 3 assumes 100% PD in the first period, discounted at the end of that period. It is not an individual recovery cash-flow assessment.
5. Each scenario multiplies annual conditional PD, capped at 100%. For a period of length d, conditional PD = 1 − (1 − annual PD)^d. Marginal PD = surviving probability before the period × conditional PD. Discount factor = 1 / (1 + effective annual rate)^t. Period ECL = EAD × LGD × marginal PD × discount factor. Sum periods for scenario ECL, then apply scenario probability weights. Weights must sum to 100%; invalid weights block saving. Fractional final periods use their actual year fraction.
6. Every facility retains the stage explanation, scenario assumptions, period EAD, marginal PD, survival probability, LGD, discount factor and loss contribution in the saved run.

Not included: amortizing cash flows, collateral allocation, effective interest estimation, forward-looking PD term structure calibration, stage cure history, rating migration rules, external ratings, overrides, write-offs, multiple currencies, legal set-off, and institution-specific exemptions. A borrower name stands in for a durable customer key in the demo.

## Stress testing

The editable initial capital, RWA, annual pre-tax income and market portfolio are planning assumptions, separate from the imported credit portfolio. Credit loss is the positive increase between base and stressed ECL using the same staging and lifetime method. The stress applies a PD multiplier and additive LGD percentage points, each capped at 100%. It does not automatically force stage migration.

Market loss = market portfolio × price decline. Income loss = annual pre-tax income × income shock. Add the entered operational loss. Tax benefit is tax rate × the lesser of total pre-tax losses and annual pre-tax income. This assumes full recognition against available taxable profit, without deferred tax assets. Closing capital = initial capital − total loss + tax benefit. Stressed RWA = initial RWA × (1 + RWA uplift). Capital ratio = capital / RWA. Headroom is measured against an editable planning hurdle, not an asserted regulatory minimum.

The capital bridge reconciles exactly. Negative capital remains visible. The presets are illustrative severities, not bank-approved or regulator-prescribed scenarios. No losses are silently calibrated to match a bank's published results.

## Design and research lineage

Local stress-testing materials informed the six-step review journey (scenario, test case, base, pre-shock, shock, post-shock), explicit missing-evidence status, separate amount/rate tolerances, source-to-result explanations and saved review packs. IFRS research informed the separation of input validation, staging, parameter assignment, ECL calculation and reporting. Original documents, account identifiers, customer records and bank calibration tables are excluded from this repository.

Source review exposed different institutions under similar document filenames and conflicting DPD boundary wording across draft versions. Consequently this application uses the transparent synthetic policy above, and does not present these drafts as approved bank configurations. A production implementation needs a controlled policy registry with effective dates, institution scope, review state and approved exceptions.

### JCB and JKB scope differences

The reviewed JCB stress design organizes scenarios into credit, climate, geopolitical, liquidity, market and additional groups. Its concentration design distinguishes the largest sectors from the largest borrowers: sector selection aggregates by the economic classification, while borrower selection aggregates all relevant accounts before ranking. It also distinguishes direct and indirect facilities, stable and unstable deposits, government-guaranteed exposures, undrawn-limit drawdowns and foreign-currency positions. Those distinctions are not interchangeable with a sector label or a top-facility ranking.

The newer JKB review-tool design adds explicit lineage, missing-evidence outcomes, independent input derivation and a review pack across the calculation chain. Earlier exported JKB VBA builds are predecessors, rather than a separate JCB rules engine. Both collections contain version-specific field names and rule inventories. Some JCB filter rows contain conflicting descriptions or ungrouped Boolean conditions; the application does not silently import or repair those policies.

The shared demonstration engine therefore keeps the same transparent calibration under JKB and JCB themes. It does not claim to implement institution-specific liquidity, FX, concentration, guarantee or sector-migration rules. Production extensions should use separately approved input mappings and parameter sets with effective dates, account-to-borrower aggregation and explicit scenario scope.

## Verification

The independent hand-calculated tests cover one-year and lifetime ECL, survival-weighted marginal PD, fractional maturity, probability weights, zero exposures, 30/31/89/90-day staging boundaries, contagion including normalized borrower whitespace, default PD, extremely small positive probabilities, malformed restored records, invalid inputs and an exactly reconciling after-tax stress bridge.
