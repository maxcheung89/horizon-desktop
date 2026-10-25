import {app,BrowserWindow} from 'electron';
import fs from 'node:fs/promises';
export async function performanceCheck(win:BrowserWindow,addTab:()=>Promise<unknown>){
 await win.webContents.executeJavaScript(`window.__perf={frames:[],longTasks:[],rpcs:[]};
 let previous=performance.now();function tick(t){window.__perf.frames.push(t-previous);previous=t;requestAnimationFrame(tick)}requestAnimationFrame(tick);
 new PerformanceObserver(list=>{for(const e of list.getEntries())window.__perf.longTasks.push(e.duration)}).observe({entryTypes:['longtask']});
 setInterval(async()=>{const t=performance.now();await window.horizon.invoke('init');window.__perf.rpcs.push(performance.now()-t)},500);`);
 const processes:unknown[]=[];
 for(let i=0;i<15;i++){
  await new Promise(r=>setTimeout(r,2000));
  processes.push({seconds:(i+1)*2,processes:app.getAppMetrics().map(p=>({type:p.type,cpu:p.cpu.percentCPUUsage,rssKB:p.memory.workingSetSize,peakKB:p.memory.peakWorkingSetSize}))});
  if(i===4)await addTab();
 }
 const renderer=await win.webContents.executeJavaScript(`(()=>{const p=window.__perf; const summarize=a=>{a.sort((a,b)=>a-b);return {count:a.length,p50:a[Math.floor(a.length*.5)]||0,p95:a[Math.floor(a.length*.95)]||0,max:a.at(-1)||0}};return {frames:summarize(p.frames),longTasks:summarize(p.longTasks),rpc:summarize(p.rpcs),networkLabels:[...document.querySelectorAll('.metric-label')].map(e=>e.firstElementChild.textContent),memoryLabel:[...document.querySelectorAll('.metric-label')].map(e=>e.textContent).filter(t=>t.includes('MEMORY')),visibleFileRows:document.querySelectorAll('.file-list button').length};})()`);
 await fs.writeFile(process.env.HORIZON_PERF!,JSON.stringify({processes,renderer},null,2));
}
