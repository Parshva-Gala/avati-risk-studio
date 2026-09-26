import {useMemo,useState} from 'react';
import {compareJKBSystemOutput} from '../lib/jkb-reconcile.mjs';
import {downloadCSV} from '../lib/format';
import {Panel} from './UI';
const number=(v:unknown,unit:string)=>typeof v==='number'&&Number.isFinite(v)?unit==='fraction'?`${(v*100).toFixed(4)}%`:v.toLocaleString('en-US',{maximumFractionDigits:4}):'—';
export default function JKBReconciliation({assessment,workbook}:{assessment:any;workbook:any}){
 const [tolerance,setTolerance]=useState(.01);
 const validTolerance=Number.isFinite(tolerance)&&tolerance>=0;
 const comparison=useMemo(()=>validTolerance?compareJKBSystemOutput(assessment,workbook,{amountTolerance:tolerance}):null,[assessment,workbook,tolerance,validTolerance]);
 return <Panel title="Independent system-output reconciliation" subtitle="Compare this calculation against the matching stored JKB system row; missing outputs never become zero." action={<button className="btn small" disabled={!comparison} onClick={()=>comparison&&downloadCSV('avati-jkb-system-reconciliation.csv',comparison.rows)}>Export differences</button>}>
 {!workbook?<div className="notice">Load the JKB workbook and apply a native case to compare its stored system outputs.</div>:<>
 <div className="jkb-recon-summary">{comparison&&<><span className="badge good">{comparison.summary.passed} passed</span><span className="badge bad">{comparison.summary.failed} differences</span><span className="badge warn">{comparison.summary.blocked} unavailable</span></>}<label className="field">Amount tolerance<input type="number" min="0" step="0.01" value={Number.isFinite(tolerance)?tolerance:''} onChange={e=>setTolerance(e.target.value===''?NaN:Number(e.target.value))}/></label></div>
 {!comparison?<p className="notice warn">Enter a non-negative amount tolerance to compare outputs.</p>:<>
 {!comparison.contextMatch&&<p className="notice warn">Select and apply the matching native case. Currency, scale, date, entity and severity must match before comparisons are valid.</p>}
 <div className="table-wrap"><table className="data-table"><thead><tr><th>Output</th><th>Stored system</th><th>Recalculated</th><th>Difference</th><th>Status</th></tr></thead><tbody>{comparison.rows.map(row=><tr key={row.id}><td>{row.label}<small>{row.reason||row.sourceRef}</small></td><td className="numeric">{number(row.expected,row.unit)}</td><td className="numeric">{number(row.actual,row.unit)}</td><td className="numeric">{row.unit==='fraction'&&typeof row.difference==='number'?`${(row.difference*100).toFixed(4)} pp`:number(row.difference,row.unit)}</td><td><span className={`badge ${row.status==='PASS'?'good':row.status==='FAIL'?'bad':'warn'}`}>{row.status}</span></td></tr>)}</tbody></table></div><p className="muted">Ratio tolerance is 0.000001 in fractional units. {comparison.note}</p></>}</>}
 </Panel>;
}
