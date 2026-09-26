import type { Workspace, Bank } from '../types';
import { demoPortfolio } from './portfolio.mjs';
import { validateWorkspaceData } from './workspace.mjs';
export const STORAGE_KEY='avati-risk-studio-v1';
export const uid=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export function createWorkspace(bank:Bank='midbank'):Workspace{return{schemaVersion:1,bank,facilities:demoPortfolio(),portfolioVersion:1,runs:[],events:[{id:uid(),date:now(),action:'Workspace created',detail:'Synthetic demonstration portfolio loaded · 18 facilities · USD millions'}],settings:{}};}
export function validateWorkspace(raw:unknown):Workspace{
 return validateWorkspaceData(raw) as Workspace;
}
export function loadWorkspace():{workspace:Workspace,error?:string}{try{const raw=localStorage.getItem(STORAGE_KEY);return{workspace:raw?validateWorkspace(JSON.parse(raw)):createWorkspace()};}catch(error){return{workspace:createWorkspace(),error:`The saved workspace could not be loaded: ${error instanceof Error?error.message:'storage unavailable'} A temporary demo is open. Original stored data has not been overwritten; restore a valid backup to resume saving.`};}}
