import fs from 'node:fs/promises';import {stripVTControlCharacters} from 'node:util';
export type LogEvent={at:number;session?:string;name:string;event:string};
export class Logs{
 events:LogEvent[]=[];private timer?:ReturnType<typeof setTimeout>;private writing=Promise.resolve();private recordings=new Map<string,{recording:boolean;text:string}>();
 constructor(private file:string){}
 async load(){try{const v=JSON.parse(await fs.readFile(this.file,'utf8'));if(Array.isArray(v))this.events=v.filter(e=>typeof e.at==='number'&&typeof e.event==='string'&&typeof e.name==='string').slice(-1000);}catch{}}
 add(event:string,name:string,session?:string){this.events.push({at:Date.now(),event,name,session});this.events=this.events.slice(-1000);clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush(),500);}
 toggle(id:string,on:boolean){if(!this.recordings.has(id)){if(this.recordings.size>=16)throw Error('Transcript limit reached. Clear an existing transcript first.');this.recordings.set(id,{recording:false,text:''});}this.recordings.get(id)!.recording=on;}
 output(id:string,data:string){const entry=this.recordings.get(id);if(entry?.recording)entry.text=(entry.text+stripVTControlCharacters(data).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'')).slice(-2000000);}
 stop(id:string){const e=this.recordings.get(id);if(e)e.recording=false;}
 clear(id:string){this.recordings.delete(id);}
 get(id?:string,full=false){return {events:this.events,recording:id?this.recordings.get(id)?.recording||false:false,text:id?(full?this.recordings.get(id)?.text||'':(this.recordings.get(id)?.text||'').slice(-50000)):''};}
 async flush(){clearTimeout(this.timer);const text=JSON.stringify(this.events);this.writing=this.writing.catch(()=>{}).then(()=>fs.writeFile(this.file,text,{mode:0o600}));await this.writing.catch(()=>{});}
}
