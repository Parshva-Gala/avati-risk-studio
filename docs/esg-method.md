# ESG screening and connected evidence

Avati's ESG module shares the active facility portfolio with credit and stress workspaces. It follows the original banking framework's principle: connected evidence, distinct conclusions. A management score, E&S decision, inventory estimate and financing classification answer different questions. This module never modifies PD, LGD, ECL or RWA from an ESG score.

## Assessment

Environmental, social and governance scores range from 0 to 100, higher meaning stronger management under the user's assessment. Weights are normalized by their positive total. The starting pillar values use the average supplied facility ESG score for the same borrower: these are indicative starting values, not independent pillar observations. The portfolio score is weighted by drawn balance. Grades A/B/C/D use internal cutoffs of 75/55/35 and are not external agency ratings.

Evidence references, owner, distinct reviewer, review date and expiry must be complete and current at the selected reporting date. An explicit review stores a change-detection fingerprint bound to its assessment and relevant portfolio inputs. Editing scores, evidence, emissions, denominators or associated financing makes the affected review stale. These local names and fingerprints are workflow records, not authenticated maker/checker identities, signatures or external assurance. An unresolved critical E&S issue produces a hold regardless of score.

The review concerns entered pillar scores and supporting facts. Changing the bank's weighting policy recalculates the composite score but does not reapprove that policy through the borrower review. Changing the reporting date re-evaluates review validity against the existing review/expiry dates. Malformed imported configuration is blocked visibly and requires an explicit settings reset; it is not silently replaced in storage.

## Financed emissions

All amounts are USD millions and emissions are tonnes CO2e. The current simplified corporate route is:

`Borrower financed emissions = borrower inventory × min(1, total drawn financing / enterprise value)`

Facilities are grouped by normalized borrower name. The same inventory is counted once; numerator balances are aggregated before applying the cap. Every facility in a group must carry the same nonnegative emissions and positive enterprise value. Conflicting or missing values exclude the borrower from quantified coverage and produce a visible reason. Zero emissions with a valid denominator remains a measured zero. Undrawn commitments and CCF are excluded. A cap is flagged for investigation rather than silently hidden.

Data coverage is drawn exposure with calculable inventory divided by total drawn exposure. Evidence coverage additionally requires an explicit current review and confirmation of the inventory boundary. A known emissions subtotal is displayed beside coverage and is not described as the complete footprint. The route does not distinguish listed EVIC from private debt plus equity, separate Scope 1/2/3, asset finance, projects or facilitated emissions. User calibration and a suitable asset-class method are needed for formal PCAF reporting. Borrower names are a temporary identity key: different legal entities with the same name or subsidiaries need explicit master identifiers in an enterprise integration.

## Sustainable finance claims

A portfolio `green` flag is only a candidate. It never creates classified financing. Each facility needs a named activity and scheme, supported eligibility, technical criteria, DNSH, minimum safeguards, use-of-proceeds confirmation, an allocated amount no greater than drawn balance, and an explicit current review. Critical E&S issues block claims. The UI calls the result a **reviewed internal claim** because the module records the user's evidenced judgment; it does not evaluate jurisdiction-specific technical thresholds or establish external taxonomy certification. Allocation supports one current claim per facility and must not be reused across external reporting boundaries without reconciliation.

## Saved runs

Capture preserves a complete portfolio, settings and derived results for the reporting date. Shell metadata supplies the portfolio version, bank theme, run ID and creation time. Subsequent input changes leave prior captures unchanged. Bank theme does not change method calibration. All starting data is synthetic; imported values remain the user's responsibility to validate.

## Source adaptation

The implementation was informed by the created ESG Banking Framework and the Avati ESG module library's financed-emissions methodology and practical notes. The latter are internal explanatory references, not controlling calculation specifications. No raw reference documents, customer records or sample bank workbooks are distributed here. In particular, illustrative factor/unit errors and the claim that banks have no direct operational emissions were not carried into the product. Broader own-operation inventories, activity-factor estimation and separate asset-class methods remain distinct extensions requiring their own validated data contracts.
