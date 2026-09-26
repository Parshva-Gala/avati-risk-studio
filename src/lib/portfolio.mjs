import {deriveStages} from './risk.mjs';
export const COLUMNS = ['id','borrower','sector','country','currency','balance','undrawn','ccf','pd','lgd','years','rate','daysPastDue','watchlist','esgScore','emissions','enterpriseValue','revenue','green'];
const numeric = ['balance','undrawn','ccf','pd','lgd','years','rate','daysPastDue','esgScore','emissions','enterpriseValue','revenue'];
export function validatePortfolio(input) {
  const errors=[]; const rows=[]; const ids=new Set();
  if(!Array.isArray(input)||!input.length) return {rows,errors:['The portfolio must contain at least one facility.']};
  if(input.length>10000) return {rows,errors:['This workspace accepts up to 10,000 facilities per import.']};
  input.forEach((raw,i)=>{
    const row={}; const fail=msg=>errors.push(`Row ${i+1}: ${msg}`);
    if(!raw||typeof raw!=='object'){fail('expected a record.');return;}
    for(const key of COLUMNS){
      const val=raw[key];
      if(val===null||val===undefined||val===''){fail(`${key} is required.`);continue;}
      if(numeric.includes(key)){
        if(typeof val!=='number'&&typeof val!=='string'){fail(`${key} must be numeric.`);continue;}
        const n=Number(val); if(!Number.isFinite(n)||String(val).trim()===''){fail(`${key} must be finite.`);continue;}
        row[key]=n;
        if(n<0)fail(`${key} cannot be negative.`);
        if(['ccf','pd','lgd','rate'].includes(key)&&n>1)fail(`${key} must be a fraction from 0 to 1.`);
        if(key==='esgScore'&&n>100)fail('esgScore must be between 0 and 100.');
        if(key==='years'&&(n<1/365||n>40))fail('years must be from 1/365 to 40; fractional years are allowed.');
        if(key==='daysPastDue'&&!Number.isInteger(n))fail('daysPastDue must be a whole number.');
      } else if(['watchlist','green'].includes(key)){
        if(![true,false,'true','false','TRUE','FALSE','1','0',1,0].includes(val))fail(`${key} must be true or false.`);
        else row[key]=[true,'true','TRUE','1',1].includes(val);
      } else {row[key]=String(val).trim(); if(!row[key])fail(`${key} is required.`); if(row[key].length>140)fail(`${key} must be under 140 characters.`);}
    }
    if(ids.has(row.id))fail(`duplicate facility ID ${row.id}.`); ids.add(row.id);
    if(row.currency&&row.currency!=='USD')fail('currency must be USD. Convert monetary fields to USD millions before import.');
    rows.push(row);
  });
  return {rows:errors.length?[]:rows,errors};
}
const seeds=[
 ['Cedar Renewables','Renewable energy','Jordan',210,.018,.32,86,18000,820,240,true,0],
 ['Nile Foods','Agriculture','Egypt',185,.025,.40,73,76000,760,320,false,0],
 ['Atlas Industries','Manufacturing','Egypt',165,.038,.46,54,320000,620,270,false,42],
 ['Levant Solar','Renewable energy','Jordan',155,.012,.28,91,9200,640,170,true,0],
 ['Tigris Logistics','Transport','Iraq',145,.032,.42,62,140000,580,290,false,0],
 ['Bluewater Utilities','Utilities','Egypt',135,.022,.36,78,98000,720,220,true,0],
 ['Horizon Properties','Real estate','Jordan',125,.045,.50,65,43000,880,190,false,32],
 ['Orion Cement','Manufacturing','Egypt',118,.067,.52,38,610000,690,260,false,96],
 ['Amman Healthcare','Healthcare','Jordan',110,.015,.30,84,27000,510,180,false,0],
 ['Delta Textiles','Manufacturing','Egypt',102,.040,.44,58,112000,410,205,false,0],
 ['Mesopotamia Trading','Trade','Iraq',94,.035,.45,66,51000,380,320,false,18],
 ['Petra Technology','Technology','Jordan',88,.019,.34,88,8500,460,130,false,0],
 ['Cairo Mobility','Transport','Egypt',82,.027,.40,76,71000,390,160,true,0],
 ['Nour Agriculture','Agriculture','Iraq',76,.052,.48,49,87000,290,180,false,65],
 ['Red Sea Hospitality','Real estate','Egypt',70,.041,.46,72,29000,510,110,false,0],
 ['Aster Financial','Financial services','Jordan',65,.013,.29,81,4800,640,160,false,0],
 ['Babylon Energy','Utilities','Iraq',58,.074,.56,43,410000,760,280,false,0],
 ['Oasis Water','Utilities','Jordan',52,.018,.31,89,14000,330,90,true,0],
];
export function demoPortfolio(){return seeds.map((s,i)=>({id:`AV-${String(i+1).padStart(4,'0')}`,borrower:String(s[0]),sector:String(s[1]),country:String(s[2]),currency:'USD',balance:Number(s[3]),undrawn:Math.round(Number(s[3])*.22),ccf:.5,pd:Number(s[4]),lgd:Number(s[5]),years:2+i%5,rate:.06+(i%3)*.01,watchlist:i===16,esgScore:Number(s[6]),emissions:Number(s[7]),enterpriseValue:Number(s[8]),revenue:Number(s[9]),green:Boolean(s[10]),daysPastDue:Number(s[11])}));}
export function aggregate(facilities,dimension='sector',measure='balance',filter=''){
 const groups=new Map(); const source=dimension==='stage'?deriveStages(facilities):facilities; const matched=source.filter(f=>!filter||f.sector===filter);
 for(const f of matched){const key=dimension==='stage'?`Stage ${f.stage}`:String(f[dimension]); if(!groups.has(key))groups.set(key,{key,count:0,balance:0,ead:0,pdSum:0,esgSum:0}); const g=groups.get(key);g.count++;g.balance+=f.balance;g.ead+=f.balance+f.undrawn*f.ccf;g.pdSum+=f.pd*f.balance;g.esgSum+=f.esgScore*f.balance;}
 return [...groups.values()].map(g=>({...g,value:measure==='pd'?(g.balance?g.pdSum/g.balance:0):measure==='esgScore'?(g.balance?g.esgSum/g.balance:0):g[measure]})).sort((a,b)=>b.value-a.value);
}
export function reconcile(expected,actual,tolerance=0.01){
 if(!Number.isFinite(tolerance)||tolerance<0)throw Error('Tolerance must be finite and non-negative.');
 const make=(rows)=>{const map=new Map();for(const r of rows){if(!r||typeof r.key!=='string'||!r.key.trim()||!Number.isFinite(r.value))throw Error('Control rows require a non-empty key and numeric value.');if(map.has(r.key))throw Error(`Duplicate control key: ${r.key}`);map.set(r.key,r.value);}return map;};
 const a=make(expected),b=make(actual);return [...new Set([...a.keys(),...b.keys()])].sort().map(key=>{const has=a.has(key)&&b.has(key);const delta=has?b.get(key)-a.get(key):null;return {key,expected:a.get(key)??null,actual:b.get(key)??null,delta,status:!has?'BLOCKED':Math.abs(delta)<=tolerance?'PASS':'FAIL'};});
}
export const sum=(rows,key)=>rows.reduce((s,r)=>s+r[key],0);
