import {DEFAULT_CUBE_CONFIG,runCube} from './cube.mjs';
import {buildRiskCubeProjection} from './riskcube-adapter.mjs';
import {DEFAULT_ECL_SCENARIOS} from './risk.mjs';
export function riskInputs(facilities,settings){
 const p=settings.cubeProjection;
 if(!p)return{facilities,bridge:null,error:''};
 const bridge=buildRiskCubeProjection(facilities,p.rows,p.selection);
 if(!bridge.valid)return{facilities,bridge,error:bridge.errors.slice(0,5).join(' ')};
 const byId=new Map(bridge.facilityCurves.map(c=>[c.facilityId,c]));
 return{facilities:facilities.map(f=>({...f,pd:byId.get(f.id).points[0].annualPd,pdCurve:byId.get(f.id).points.map(p=>p.annualPd)})),bridge,error:''};
}
export function aggregateCube(result,dimension,measure,sector=''){
 const groups=new Map();
 for(const f of result.facilities.filter(f=>!sector||f.sector===sector)){const key=f[dimension];if(!groups.has(key))groups.set(key,{key,count:0,balance:0,value:0});const group=groups.get(key);group.count++;group.balance+=f.baseEad;group.value+=f[measure];}
 return [...groups.values()].sort((a,b)=>b.value-a.value);
}
export function connectedContext(facilities,settings){
 const projection=settings.cubeProjection;
 const bridge=projection?buildRiskCubeProjection(facilities,projection.rows,projection.selection):null;
 try{
  if(bridge&&!bridge.valid)throw Error(bridge.errors.slice(0,5).join(' '));
  const config={...DEFAULT_CUBE_CONFIG,...(settings.cubeConfig||{}),...(bridge?.valid?{pdOverrides:bridge.facilityCurves,pdProvenance:bridge.provenance}:{})};
  return{bridge,result:runCube(facilities,config,settings.esg||{},settings.eclScenarios||DEFAULT_ECL_SCENARIOS),error:''};
 }catch(error){return{bridge,result:null,error:error.message};}
}
