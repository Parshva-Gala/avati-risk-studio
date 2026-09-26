export type Bank = 'midbank' | 'jkb' | 'nbi' | 'jcb';
export type Page = 'desk' | 'cube' | 'portfolio' | 'esg' | 'stress' | 'ecl' | 'pivot' | 'reports' | 'activity';
export interface Facility { id:string; borrower:string; sector:string; country:string; currency:string; balance:number; undrawn:number; ccf:number; pd:number; lgd:number; years:number; rate:number; daysPastDue:number; watchlist:boolean; esgScore:number; emissions:number; enterpriseValue:number; revenue:number; green:boolean; }
export interface Run { id:string; module:'RiskCube'|'ESG'|'Stress'|'ECL'|'Pivot'; name:string; date:string; bank:Bank; portfolioVersion:number; summary:Record<string,string|number>; payload:unknown; }
export interface AuditEvent { id:string; date:string; action:string; detail:string; }
export interface Workspace { schemaVersion:1; bank:Bank; facilities:Facility[]; portfolioVersion:number; runs:Run[]; events:AuditEvent[]; settings:Record<string,unknown>; }
export interface ModuleProps { facilities:Facility[]; bank:Bank; portfolioVersion:number; settings:Record<string,unknown>; saveSetting:(key:string,value:unknown)=>void; onRun:(run:Omit<Run,'id'|'date'|'bank'|'portfolioVersion'>)=>void; }
