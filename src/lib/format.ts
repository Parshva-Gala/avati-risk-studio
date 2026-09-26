export const money=(n:number,d=1)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}).format(n);
export const compact=(n:number)=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n);
export const pct=(n:number,d=1)=>`${(n*100).toFixed(d)}%`;
export function download(name:string,content:string,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function csvCell(value:unknown){
 const raw=String(value??'');
 // Keep genuine numeric exports numeric, while preventing text fields (including
 // imported summary headers) from becoming formulas after spreadsheet trimming.
 const risky=typeof value!=='number'&&(/^[\s\u0000-\u001f\u007f]*[=+@\-]/u.test(raw)||/^[\t\r\n]/.test(raw));
 return `"${(risky?"'"+raw:raw).replaceAll('"','""')}"`;
}
export function downloadCSV(name:string,rows:Record<string,unknown>[]){if(!rows.length)return;const keys=Object.keys(rows[0]);download(name,[keys.map(csvCell).join(','),...rows.map(r=>keys.map(k=>csvCell(r[k])).join(','))].join('\r\n'),'text/csv;charset=utf-8');}
