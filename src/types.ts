export type Session={parentId?:string;machine?:string;id:string;name:string;kind:'local'|'ssh'|'serial';cwd:string;shell:string;closed:boolean;workingFile?:string;fileDetails?:{size?:number;modified?:number;error?:string}};
export type FileEntry={name:string;directory:boolean;size:number};
export type Metric={id:string;at:number;cpu:number|null;memory:{used:number;total:number};rx:number|null;tx:number|null;disks:{mount:string;total:number;used:number}[];source:string;appMemoryMB?:number;error?:string};
export type Profile={id?:string;name:string;host:string;port:number;username:string;password?:string;privateKeyPath?:string;hasPassword?:boolean;fingerprint?:string};
export type Index={id:string;files:string[];count:number;done:boolean;limited:boolean;skipped:number};
declare global {interface Window{horizon:{invoke:(method:string,...args:unknown[])=>Promise<any>;on:(channel:string,fn:(data:any)=>void)=>()=>void}}}
export const api=window.horizon;
export function bytes(n:number){if(!Number.isFinite(n))return '—';const units=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<4){n/=1024;i++;}return `${n.toFixed(i>1?1:0)} ${units[i]}`;}
