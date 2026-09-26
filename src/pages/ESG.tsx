import { useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Leaf, Save, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { ModuleProps } from '../types';
import { assessmentDefaults, assessmentReviewStamp, calculateESG, DEFAULT_ESG_CONFIG, evidenceGates, taxonomyReviewStamp, taxonomyDefaults, validateESGConfig } from '../lib/esg.mjs';
import { Metric, PageHeader } from '../components/UI';

const number = (value: number | null, digits = 1) => value === null || !Number.isFinite(value) ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const percent = (value: number | null) => value === null ? '—' : `${number(value * 100)}%`;
const scoreTone = (score: number | null) => score === null ? '' : score >= 75 ? 'good' : score >= 55 ? 'warn' : 'bad';
const tabs = ['Overview', 'Assessments', 'Taxonomy', 'Method'];
const pillars = ['environmental', 'social', 'governance'];
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function EvidenceFields({ record, update }: { record: any; update: (patch: any) => void }) {
  return <div className="form-grid">
    <label className="field" style={{ gridColumn: '1 / -1' }}>Evidence reference<input value={record.evidence || ''} onChange={e => update({ evidence: e.target.value })} placeholder="Document / working-paper reference and location" /></label>
    <label className="field">Assessment owner<input value={record.owner || ''} onChange={e => update({ owner: e.target.value })} placeholder="Owner name" /></label>
    <label className="field">Reviewer<input value={record.reviewer || ''} onChange={e => update({ reviewer: e.target.value })} placeholder="Different reviewer name" /></label>
    <label className="field">Reviewed on<input type="date" value={record.reviewedOn || ''} onChange={e => update({ reviewedOn: e.target.value })} /></label>
    <label className="field">Valid through<input type="date" value={record.expiresOn || ''} onChange={e => update({ expiresOn: e.target.value })} /></label>
  </div>;
}

export default function ESG({ facilities, bank, portfolioVersion, settings, saveSetting, onRun }: ModuleProps) {
  const [tab, setTab] = useState('Overview');
  const [selectedBorrower, setSelectedBorrower] = useState('');
  const [selectedFacility, setSelectedFacility] = useState('');
  const [message, setMessage] = useState('');
  const importedIssues = useMemo(() => settings.esg === undefined ? [] : validateESGConfig(settings.esg), [settings.esg]);
  const config: any = useMemo(() => {
    const saved: any = !importedIssues.length && settings.esg && typeof settings.esg === 'object' ? settings.esg : {};
    return { ...DEFAULT_ESG_CONFIG, ...saved, weights: { ...DEFAULT_ESG_CONFIG.weights, ...saved.weights }, assessments: saved.assessments || {}, taxonomy: saved.taxonomy || {} };
  }, [settings.esg, importedIssues]);
  const result: any = useMemo(() => calculateESG(facilities, config), [facilities, config]);
  const summary = result.summary;
  const borrower: any = result.borrowers.find((b: any) => b.key === selectedBorrower) || result.borrowers[0];
  const claim: any = result.taxonomy.find((t: any) => t.id === selectedFacility) || result.taxonomy.find((t: any) => t.candidate) || result.taxonomy[0];
  const assessment: any = borrower?.assessment || assessmentDefaults([]);
  const taxonomy: any = claim?.record || taxonomyDefaults();
  const assessmentReasons = evidenceGates(assessment, config.asOf);
  if (pillars.some(p => typeof assessment[p] !== 'number' || assessment[p] < 0 || assessment[p] > 100)) assessmentReasons.push('Enter all three pillar scores from 0 to 100.');

  function updateConfig(patch: any) { saveSetting('esg', { ...config, ...patch }); setMessage(''); }
  function updateAssessment(patch: any) {
    if (borrower) updateConfig({ assessments: { ...config.assessments, [borrower.key]: { ...assessment, ...patch } } });
  }
  function updateTaxonomy(patch: any) {
    if (claim) updateConfig({ taxonomy: { ...config.taxonomy, [claim.id]: { ...taxonomy, ...patch } } });
  }
  function capture() {
    onRun({ module: 'ESG', name: `ESG & sustainability · ${config.asOf}`, summary: { 'Portfolio score': summary.weightedScore === null ? 'Unrated' : Number(summary.weightedScore.toFixed(1)), 'Financed emissions tCO2e': summary.financedEmissions === null ? 'Unavailable' : Number(summary.financedEmissions.toFixed(1)), 'Data coverage %': summary.dataCoverage === null ? 'Unavailable' : Number((summary.dataCoverage * 100).toFixed(1)), 'Reviewed claims USD m': Number(summary.claimedBalance.toFixed(2)), 'Critical holds': summary.criticalHolds }, payload: structuredClone({ method: result.method, bank, portfolioVersion, facilities, config, result }) });
    setMessage('ESG report captured. Open Reports to inspect or export the complete snapshot.');
  }

  if (importedIssues.length) return <><PageHeader eyebrow="02 / Sustainability intelligence" title="Review imported ESG settings." description="The saved configuration contains unsupported values. It remains intact until you choose to reset it." /><div className="notice bad" role="alert">{importedIssues.join(' ')}</div><button className="btn primary" onClick={() => saveSetting('esg', structuredClone(DEFAULT_ESG_CONFIG))}>Reset ESG settings</button><p className="muted">Export a workspace backup from Activity before resetting if you need to retain the supplied configuration.</p></>;

  return <>
    <PageHeader eyebrow="02 / Sustainability intelligence" title="ESG & sustainable finance." description="Follow the evidence from borrower assessment to portfolio impact." action={<button className="btn primary" onClick={capture} disabled={!result.valid || facilities.length === 0}><Save size={16} />Capture ESG report</button>} />
    {message && <div className="notice" role="status"><CheckCircle2 size={17} /> {message}</div>}
    {!result.valid && <div className="notice" role="alert"><TriangleAlert size={17} /> {result.issues.join(' ')}</div>}
    <div className="metrics">
      <Metric label="Portfolio ESG score" value={<>{number(summary.weightedScore)}<small> / 100</small></>} detail="Exposure-weighted · indicative" icon={<ShieldCheck size={16}/>} />
      <Metric label="Financed emissions" value={<>{number(summary.financedEmissions, 0)}<small> tCO₂e</small></>} detail={`Known subtotal · ${percent(summary.dataCoverage)} data coverage`} icon={<Leaf size={16}/>} />
      <Metric label="Reviewed internal claims" value={`$${number(summary.claimedBalance)}m`} detail={`${summary.reviewedClaims} facilities · evidence gated`} />
      <Metric label="E&S escalation" value={`${summary.criticalHolds} holds`} detail="Critical concerns remain visible" />
    </div>
    <div className="tabs" aria-label="ESG workspace views">{tabs.map(t => <button key={t} aria-pressed={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>

    {facilities.length === 0 ? <div className="panel"><h2>Your connected portfolio starts here</h2><p className="muted">Add or import facilities in Portfolio to assess customers, estimate emissions and review sustainable-finance claims.</p></div> : <>
    {tab === 'Overview' && <>
      <div className="grid-2">
        <section className="panel"><div className="panel-header"><div><div className="eyebrow">PORTFOLIO QUALITY</div><h2>Management rating distribution</h2></div><ShieldCheck size={20} /></div>
          <p className="muted">Internal grades by drawn exposure. A strong score does not override an E&S hold.</p>
          {result.distribution.map((d: any) => <div key={d.grade} style={{ margin: '20px 0' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}><span><b>{d.grade === 'Unrated' ? d.grade : `Grade ${d.grade}`}</b> <span className="muted">· {d.count} borrowers</span></span><b>${number(d.balance)}m</b></div><div className="bar-track"><div className="bar-fill" style={{ width: `${summary.exposure ? d.balance / summary.exposure * 100 : 0}%`, opacity: d.grade === 'A' ? 1 : d.grade === 'B' ? .8 : .55 }} /></div></div>)}
        </section>
        <section className="panel"><div className="panel-header"><div><div className="eyebrow">EVIDENCE BEFORE CLAIMS</div><h2>Sustainability at a glance</h2></div><Leaf size={20} /></div>
          <div className="grid-2"><div><p className="muted">Green candidate financing</p><h2>${number(summary.candidateBalance)}m</h2><p className="muted">Supplied flags awaiting activity-level checks.</p></div><div><p className="muted">Inventory evidence coverage</p><h2>{percent(summary.evidenceCoverage)}</h2><p className="muted">Current reviews with confirmed inventory boundaries.</p></div></div>
          <div className="notice">{summary.cappedBorrowers ? `${summary.cappedBorrowers} borrower attribution ${summary.cappedBorrowers === 1 ? 'is' : 'are'} capped at 100%. Review financing and denominator scope.` : 'Borrower inventories are deduplicated across facilities before attribution.'}</div>
          <button className="btn" onClick={() => setTab('Taxonomy')}>Review financing candidates <ArrowUpRight size={16} /></button>
        </section>
      </div>
      <section className="panel"><div className="panel-header"><div><div className="eyebrow">CONNECTED CUSTOMERS</div><h2>Assessment & financed footprint</h2></div><span className="badge">{result.borrowers.length} borrowers</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Borrower</th><th>Drawn · $m</th><th>Score</th><th>Attribution</th><th>Financed · tCO₂e</th><th>Evidence / E&S</th><th /></tr></thead><tbody>{result.borrowers.map((b: any) => <tr key={b.key}><td><b>{b.name}</b><div className="muted">{b.sector} · {b.rows.length} {b.rows.length === 1 ? 'facility' : 'facilities'}</div></td><td>{number(b.balance)}</td><td><span className={`badge ${scoreTone(b.score)}`}>{b.grade} · {number(b.score)}</span></td><td>{percent(b.attribution)}{b.capped && <div className="badge warn">Capped</div>}</td><td>{number(b.financedEmissions, 0)}{!b.covered && <div className="muted">Uncovered</div>}</td><td><span className={`badge ${b.assessment.criticalIssue ? 'bad' : b.reviewed ? 'good' : 'warn'}`}>{b.assessment.criticalIssue ? 'E&S hold' : b.evidenceState}</span></td><td><button className="btn" onClick={() => { setSelectedBorrower(b.key); setTab('Assessments'); }}>Assess</button></td></tr>)}</tbody></table></div></section>
    </>}

    {tab === 'Assessments' && borrower && <div className="grid-2">
      <section className="panel"><div className="panel-header"><div><div className="eyebrow">BORROWER WORKBENCH</div><h2>Assess management & evidence</h2></div></div>
        <label className="field">Borrower<select value={borrower.key} onChange={e => setSelectedBorrower(e.target.value)}>{result.borrowers.map((b: any) => <option value={b.key} key={b.key}>{b.name}</option>)}</select></label>
        <p className="muted">Scores apply to all {borrower.rows.length} connected facilities. Initial pillar values inherit the supplied overall score.</p>
        <div className="grid-3">{pillars.map(p => <label className="field" key={p}>{label(p)}<input aria-label={`${label(p)} score`} type="number" min="0" max="100" step="1" value={assessment[p] ?? ''} onChange={e => updateAssessment({ [p]: e.target.value === '' ? null : Number(e.target.value) })} /><small className="muted">Score / 100</small></label>)}</div>
        <div className="notice"><b>{number(borrower.score)} / 100 · Grade {borrower.grade}</b><span> {borrower.esDecision}</span></div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '18px 0' }}><input type="checkbox" checked={assessment.criticalIssue === true} onChange={e => updateAssessment({ criticalIssue: e.target.checked })} /><span>Unresolved critical environmental or social issue<small className="muted" style={{ display: 'block' }}>Creates an E&S hold and prevents financing claims.</small></span></label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '18px 0' }}><input type="checkbox" checked={assessment.emissionsConfirmed === true} onChange={e => updateAssessment({ emissionsConfirmed: e.target.checked })} /><span>Inventory boundary, period and enterprise value checked against evidence</span></label>
        <EvidenceFields record={assessment} update={updateAssessment} />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 20 }}><button className="btn primary" disabled={assessmentReasons.length > 0} onClick={() => { updateAssessment({ reviewStamp: assessmentReviewStamp(assessment, borrower.rows) }); setMessage(`Current review recorded for ${borrower.name}.`); }}><ShieldCheck size={16} />Record review</button><span className={`badge ${borrower.reviewed ? 'good' : 'warn'}`}>{borrower.evidenceState}</span></div>
        {assessmentReasons.length > 0 && <p className="muted">{assessmentReasons.join(' ')}</p>}
      </section>
      <div>
        <section className="panel"><div className="panel-header"><h2>Financing attribution</h2><Leaf size={20} /></div>
          <div className="grid-2"><div><p className="muted">Combined drawn balance</p><h2>${number(borrower.balance)}m</h2></div><div><p className="muted">Enterprise value</p><h2>${number(borrower.enterpriseValue)}m</h2></div><div><p className="muted">Borrower inventory</p><h2>{number(borrower.emissions, 0)} t</h2></div><div><p className="muted">Attributed footprint</p><h2>{number(borrower.financedEmissions, 0)} t</h2></div></div>
          <p className="muted">Inventory × min(100%, combined financing ÷ enterprise value). Undrawn commitments are excluded.</p>
          {borrower.emissionReasons.map((reason: string) => <div className="notice" key={reason}><TriangleAlert size={17} /> {reason}</div>)}
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Facility</th><th>Drawn · $m</th><th>Share of footprint · t</th></tr></thead><tbody>{borrower.rows.map((f: any) => <tr key={f.id}><td>{f.id}</td><td>{number(f.balance)}</td><td>{number(borrower.financedEmissions === null ? null : borrower.balance > 0 ? borrower.financedEmissions * f.balance / borrower.balance : 0, 0)}</td></tr>)}</tbody></table></div>
        </section>
        <section className="panel"><div className="eyebrow">ASSESSMENT POLICY</div><h2>Pillar weighting & date</h2><p className="muted">Weights normalize to 100%. The date controls whether reviews are current.</p><div className="grid-3">{pillars.map(p => <label className="field" key={p}>{label(p)}<input aria-label={`${label(p)} weight`} type="number" min="0" value={config.weights[p]} onChange={e => updateConfig({ weights: { ...config.weights, [p]: e.target.value === '' ? 0 : Number(e.target.value) } })} /></label>)}</div><p className="muted">Current total: {number(result.weightTotal, 0)} · effective weights {pillars.map(p => result.weightTotal > 0 ? `${Math.round(config.weights[p] / result.weightTotal * 100)}%` : '—').join(' / ')}</p><label className="field">Reporting date<input type="date" value={config.asOf} onChange={e => updateConfig({ asOf: e.target.value })} /></label></section>
      </div>
    </div>}

    {tab === 'Taxonomy' && claim && <>
      <div className="notice"><Leaf size={17} /> Candidate financing and reviewed internal claims are separate. Supplied green flags never create an approved taxonomy result.</div>
      <div className="grid-2"><section className="panel"><div className="panel-header"><div><div className="eyebrow">ACTIVITY & ALLOCATION</div><h2>Review a financing claim</h2></div></div><label className="field">Facility<select value={claim.id} onChange={e => setSelectedFacility(e.target.value)}>{result.taxonomy.map((t: any) => <option value={t.id} key={t.id}>{t.id} · {t.borrower}{t.candidate ? ' · Candidate' : ''}</option>)}</select></label>
        <div className="form-grid"><label className="field">Scheme / method<input value={taxonomy.scheme} onChange={e => updateTaxonomy({ scheme: e.target.value })} /></label><label className="field">Activity / use of proceeds<input value={taxonomy.activity} onChange={e => updateTaxonomy({ activity: e.target.value })} placeholder="Specific project or expenditure" /></label><label className="field">Claim allocation · USD m<input type="number" min="0" max={claim.balance} step="0.01" value={taxonomy.allocated ?? ''} onChange={e => updateTaxonomy({ allocated: e.target.value === '' ? null : Number(e.target.value) })} /><small className="muted">Drawn facility limit: ${number(claim.balance)}m</small></label></div>
        <h3>Evidence checklist</h3><p className="muted">Confirm against the named scheme and record the supporting source. These checks capture your assessment.</p>
        {([['eligible', 'Activity is eligible under the selected scheme'], ['technical', 'Activity-specific technical criteria are supported'], ['dnsh', 'Do-no-significant-harm conditions are satisfied'], ['safeguards', 'Minimum social safeguards are satisfied'], ['allocation', 'Use of proceeds and allocation are evidenced']] as const).map(([key, title]) => <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '16px 0' }}><input type="checkbox" checked={taxonomy[key] === true} onChange={e => updateTaxonomy({ [key]: e.target.checked })} /><span>{title}</span></label>)}
        <EvidenceFields record={taxonomy} update={updateTaxonomy} /><div style={{ marginTop: 20 }}><button className="btn primary" disabled={claim.reasons.length > 0} onClick={() => { updateTaxonomy({ reviewStamp: taxonomyReviewStamp(taxonomy, facilities.find(f => f.id === claim.id)!) }); setMessage(`Internal financing claim review recorded for ${claim.id}.`); }}><ShieldCheck size={16} />Record claim review</button></div>
      </section><section className="panel"><div className="panel-header"><h2>Claim decision</h2><span className={`badge ${claim.approved ? 'good' : 'warn'}`}>{claim.status}</span></div><div className="metric"><span className="muted">Recognized internal allocation</span><strong>${number(claim.claimedBalance)}<small> m</small></strong><span className="muted">{claim.borrower} · {claim.id}</span></div><h3>{claim.approved ? 'Review controls complete' : 'What is still needed'}</h3>{claim.reasons.length > 0 ? <ul>{claim.reasons.map((reason: string) => <li key={reason} style={{ marginBottom: 12 }}>{reason}</li>)}</ul> : <p className="muted">{claim.reviewed ? 'All current evidence and allocation gates passed.' : 'Complete the explicit review to recognize this internal claim.'}</p>}<div className="notice">This is a recorded internal assessment. Scheme-specific technical thresholds and external certification are not calculated by this screening module.</div><p className="muted">Changing supporting facts invalidates the review. Critical borrower concerns block claims regardless of the overall ESG score.</p></section></div>
      <section className="panel"><div className="panel-header"><h2>Financing claims register</h2><span className="badge">{summary.reviewedClaims} reviewed</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Facility / borrower</th><th>Candidate flag</th><th>Drawn · $m</th><th>Reviewed allocation · $m</th><th>Decision</th></tr></thead><tbody>{result.taxonomy.map((t: any) => <tr key={t.id}><td><button className="btn" onClick={() => setSelectedFacility(t.id)}>{t.id}</button> {t.borrower}</td><td>{t.candidate ? 'Yes' : 'No'}</td><td>{number(t.balance)}</td><td>{number(t.claimedBalance)}</td><td><span className={`badge ${t.approved ? 'good' : t.candidate ? 'warn' : ''}`}>{t.status}</span></td></tr>)}</tbody></table></div></section>
    </>}

    {tab === 'Method' && <div className="grid-2">
      <section className="panel"><div className="eyebrow">CONNECTED EVIDENCE, DISTINCT CONCLUSIONS</div><h2>How the module works</h2><h3>Management assessment</h3><p>Three pillar scores combine using your weights. Portfolio scores use drawn exposure. A is 75–100, B is 55–74.9, C is 35–54.9 and D is below 35. These are internal screening bands.</p><h3>Financed footprint</h3><p>One inventory per borrower is multiplied by combined drawn financing divided by enterprise value, capped at 100%. Conflicting inventories or denominators are uncovered. Known subtotals remain paired with coverage.</p><h3>Financing claims</h3><p>Candidate flags identify a review queue. Current evidence, activity checks, allocation and explicit review are required for a reviewed internal claim. A critical E&S issue blocks the claim.</p></section>
      <section className="panel"><div className="eyebrow">BOUNDARIES & CONTROL</div><h2>Interpret results with context</h2><p>The corporate emissions approximation does not implement all PCAF asset classes or separate emissions scopes. Name-based borrower matching needs entity master validation when importing group structures.</p><p>Initial E/S/G pillar values inherit the supplied overall score. Replace them with evidenced assessments. Ratings do not mechanically change credit PD, LGD, provisions or capital.</p><p>Local review names and fingerprints record a workflow. They are not authenticated approvals or assurance. Named taxonomy criteria are user-entered judgments; activity-specific regulatory thresholds are not evaluated here.</p><p>Captured reports preserve the portfolio and assumptions. A bank theme changes presentation while the shared methodology remains the same.</p><div className="notice">{result.method} · Reporting date {config.asOf} · Portfolio version {portfolioVersion}</div></section>
    </div>}
    </>}
  </>;
}
