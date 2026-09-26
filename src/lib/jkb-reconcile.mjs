// Compare one independently calculated case with the stored native system row.
// Imported outputs are controls, never calculation inputs.
const FIELDS = [
 ['ead','OUTST_LCY'],['ecl','ECL_LCY'],['pbt','PROFITS_BEFORE_TAX_LCY'],['pat','PROFITS_AFTER_TAX_LCY'],
 ['cet1','CET1_CAPITAL_LCY'],['at1','AT1_CAPITAL_LCY'],['t2','T2_CAPITAL_LCY'],['totalCapital','TOTAL_CAPITAL_LCY'],
 ['rwaCredit','RWA_CR_LCY'],['rwaOperational','RWA_OR_LCY'],['rwa','TOTAL_RWA'],['car','REGULATORY_CAR'],['cet1Ratio','CET1_CAR'],
 ['hqla','LCR_HQLA'],['outflows','LCR_OUTFLOW'],['inflows','LCR_INFLOW'],['lcr','LCR'],
 ['asf','NSFR_TOTAL_ASF'],['rsf','NSFR_TOTAL_RSF'],['nsfr','NSFR'],
 ['liquidAssets','LEG_LIQ_TOTAL_ASSETS'],['liquidLiabilities','LEG_LIQ_TOTAL_LIAB'],['legalLiquidity','LEGAL_LIQUIDITY_RATIO'],
];
export function compareJKBSystemOutput(assessment,pack,{amountTolerance=.01,ratioTolerance=.000001}={}){
 if(!Number.isFinite(amountTolerance)||amountTolerance<0||!Number.isFinite(ratioTolerance)||ratioTolerance<0)throw Error('Reconciliation tolerances must be finite and nonnegative.');
 const source=assessment?.config?.source;
 const native=pack?.cases?.find(c=>c.key===source?.caseKey);
 const control=pack?.outputs?.find(c=>c.caseKey===source?.caseKey);
 const contextMatch=Boolean(assessment?.schema==='AVATI_JKB_STRESS_V1'&&assessment.config.basis==='workbook'&&native&&control&&source.filename===pack.source.filename&&assessment.units.currency===pack.source.currency&&assessment.units.amountUnit===pack.source.amountUnit&&assessment.config.severity===native.severity&&source.asOf===native.asOf&&source.entity===native.entity);
 const rows=FIELDS.map(([id,header])=>{
  const trace=assessment?.rows?.find(r=>r.id===id);const unit=trace?.unit||(['car','cet1Ratio','lcr','nsfr','legalLiquidity'].includes(id)?'fraction':'amount');
  const expected=contextMatch?control.values?.[header]:null,actual=assessment?.stressed?.[id];const comparable=Number.isFinite(expected)&&Number.isFinite(actual);
  const tolerance=unit==='fraction'?ratioTolerance:amountTolerance;
  const difference=comparable?actual-expected:null;
  return{id,label:trace?.label||id,unit,expected:Number.isFinite(expected)?expected:null,actual:Number.isFinite(actual)?actual:null,difference,tolerance,status:!contextMatch||!comparable?'BLOCKED':Math.abs(difference)<=tolerance?'PASS':'FAIL',reason:!contextMatch?'Choose the matching native case, date, entity, currency and scale.':!Number.isFinite(expected)?'Stored system output is missing.':!Number.isFinite(actual)?'Calculated result is unavailable.':'',sourceRef:native?`Scenario Element Output / row ${native.row} / ${header}`:header};
 });
 return{schema:'AVATI_JKB_SYSTEM_COMPARISON_V1',caseKey:source?.caseKey||null,contextMatch,rows,summary:{passed:rows.filter(r=>r.status==='PASS').length,failed:rows.filter(r=>r.status==='FAIL').length,blocked:rows.filter(r=>r.status==='BLOCKED').length},note:'Native controls are stored system snapshots. A difference may reflect inputs, source formula defects or documented method extensions; it is not suppressed.'};
}
