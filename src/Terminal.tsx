import {useEffect,useRef} from 'react';
import {Terminal as XTerminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {api} from './types';
import '@xterm/xterm/css/xterm.css';
export function Terminal({id,active,focused=active}:{id:string;active:boolean;focused?:boolean}){
 const ref=useRef<HTMLDivElement>(null),term=useRef<XTerminal>(null),fit=useRef<FitAddon>(null);
 useEffect(()=>{const t=new XTerminal({fontFamily:'Menlo, Consolas, monospace',fontSize:11,lineHeight:1.04,letterSpacing:0,cursorBlink:true,scrollback:2000,theme:{background:'#000000',foreground:'#ffffff',cursor:'#ffffff',selectionBackground:'#ffffff44'}});const f=new FitAddon();t.loadAddon(f);t.open(ref.current!);term.current=t;fit.current=f;let alive=true,ready=false;const queued:string[]=[];
 const write=(data:string)=>t.write(data,()=>{if(alive)void api.invoke('ack',id).catch(()=>{});});
 const unsub=api.on('terminal:data',(d:{id:string;data:string})=>{if(d.id!==id)return;if(ready)write(d.data);else queued.push(d.data);});
 api.invoke('snapshot',id).then(text=>{if(alive){t.reset();t.write(text);ready=true;for(const data of queued)write(data);queued.length=0;}}).catch(()=>{});
 const input=t.onData(data=>void api.invoke('input',id,data).catch(()=>{}));
 const resize=()=>{if(ref.current?.offsetWidth){f.fit();void api.invoke('resize',id,t.cols,t.rows);}};
 const ro=new ResizeObserver(resize);ro.observe(ref.current!);resize();
 return()=>{alive=false;unsub();input.dispose();ro.disconnect();t.dispose();};},[id]);
 useEffect(()=>{if(active&&ref.current?.offsetWidth){fit.current?.fit();if(focused)term.current?.focus();}},[active,focused]);
 return <div ref={ref} className="terminal-instance" style={{display:active?'block':'none'}}/>;
}
