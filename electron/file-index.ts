import fs from 'node:fs/promises';
import path from 'node:path';
export type FileIndex={files:string[];count:number;done:boolean;limited:boolean;skipped:number;revision:number};
type Options={sampleSize?:number;maxFiles?:number;maxDirectories?:number;maxDepth?:number;maxDurationMs?:number;batchSize?:number;delayMs?:number;paused?:()=>boolean};
/** One streaming, bounded scan per application, shared by every local session. */
export class FileIndexer{
 readonly state:FileIndex={files:[],count:0,done:false,limited:false,skipped:0,revision:0};
 private running?:Promise<void>;private cancelled=false;private snapshotFiles:string[]=[];private publishedAt=0;
 constructor(private root:string,private options:Options={}){}
 start(){return this.running??=this.scan();}
 stop(){this.cancelled=true;}
 snapshot(){const now=Date.now();if((this.snapshotFiles.length<(this.options.sampleSize??1200)&&this.state.files.length>this.snapshotFiles.length*2)||now-this.publishedAt>15000||(!this.snapshotFiles.length&&this.state.files.length)||this.state.done&&this.state.revision===0){this.snapshotFiles=this.state.files.slice();this.publishedAt=now;this.state.revision++;}return {...this.state,files:this.snapshotFiles};}
 async load(cache:string){try{const c=JSON.parse(await fs.readFile(cache,'utf8'));if(c.root!==this.root||Date.now()-c.at>3600000||!c.state?.done||!Array.isArray(c.state.files)||c.state.files.length>(this.options.sampleSize??1200)||!c.state.files.every((f:unknown)=>typeof f==='string'&&f.length<4096))return;Object.assign(this.state,c.state,{revision:0});this.snapshotFiles=this.state.files.slice();}catch{}}
 async save(cache:string){if(this.state.done)await fs.writeFile(cache,JSON.stringify({root:this.root,at:Date.now(),state:this.state}),{mode:0o600}).catch(()=>{});}
 private async scan(){
  if(this.state.done)return;const o=this.options,started=Date.now();let directories=0,entries=0;const maxFiles=o.maxFiles??500000,maxDirs=o.maxDirectories??25000,maxDepth=o.maxDepth??32,sampleSize=o.sampleSize??1200;
  const exhausted=()=>this.cancelled||this.state.count>=maxFiles||directories>=maxDirs||Date.now()-started>(o.maxDurationMs??120000);
  const walk=async(dir:string,depth:number):Promise<void>=>{
   if(exhausted()){this.state.limited=true;return;}if(depth>maxDepth){this.state.skipped++;this.state.limited=true;return;}directories++;
   try{const iterator=await fs.opendir(dir,{bufferSize:32});for await(const e of iterator){
    if(exhausted()){this.state.limited=true;break;}
    if(++entries%(o.batchSize??128)===0)await new Promise(r=>setTimeout(r,o.delayMs??16));
    while(o.paused?.()&&!this.cancelled&&!exhausted())await new Promise(r=>setTimeout(r,250));
    if(exhausted()){this.state.limited=true;break;}
    const p=path.join(dir,e.name);if(e.isSymbolicLink())continue;
    if(e.isDirectory()){if(!['/dev','/proc','/sys','/System/Volumes','/Volumes'].includes(p))await walk(p,depth+1);}
    else if(e.isFile()){this.state.count++;if(this.state.files.length<sampleSize)this.state.files.push(p);}
   }}catch{this.state.skipped++;}
  };
  await walk(this.root,0);this.state.done=true;this.state.revision=0;
 }
}
export async function directoryPage(dir:string,limit=2000){
 const items:{name:string;directory:boolean;size:number}[]=[];let truncated=false;
 const iterator=await fs.opendir(dir,{bufferSize:32});
 for await(const e of iterator){if(items.length>=limit){truncated=true;break;}items.push({name:e.name,directory:e.isDirectory(),size:0});}
 // A fixed pool prevents a large directory from creating an unbounded Promise.all.
 let next=0;await Promise.all(Array.from({length:8},async()=>{for(;;){const i=next++;if(i>=items.length)return;const e=items[i];if(!e.directory)e.size=(await fs.stat(path.join(dir,e.name)).catch(()=>({size:0}))).size;}}));
 items.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));return {items,truncated};
}
