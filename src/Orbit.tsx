import {FileExtraction,Origin} from './FileExtraction';
import {RingPosition,textWidth,advance,TRACKS,TRACK_GAP,INNER_RADIUS,CORE_RADIUS,trackPhase,trackSpeed,dialDelta} from './ring-layout';
import {memo,useEffect,useRef,useState} from 'react';
export const Orbit=memo(function Orbit({files,playing,logo=false,selected,details,machine}:{files:string[];playing:boolean;logo?:boolean;selected?:string;machine?:string;details?:{size?:number;modified?:number;error?:string}}){
 const box=useRef<HTMLDivElement>(null),ring=useRef<HTMLCanvasElement>(null),core=useRef<HTMLCanvasElement>(null),worker=useRef<Worker>(null);
 const [extraction,setExtraction]=useState<Origin|null>(null),selectedRef=useRef(selected);selectedRef.current=selected;
 const pendingFocus=useRef<Origin|null>(null);
 const extracted=useRef(''),geometry=useRef<Record<string,RingPosition>>({}),latest=useRef(files);latest.current=files;
 const motion=playing&&!selected,running=useRef(motion);running.current=motion;
 const angles=useRef(Array.from({length:TRACKS},(_,i)=>trackPhase(i))),wheel=useRef(0),wake=useRef(()=>{}),resizeRing=useRef(()=>{});
 const dial=useRef<{file:string;p:RingPosition;from:number;delta:number;start:number}|null>(null);
 const submit=useRef((hide=false)=>{});
 function freeze(file:string,p:RingPosition){
  const half=(textWidth(p.text,p.size)-advance(Array.from(p.text).at(-1)||' ',p.size))/2;
  extracted.current=file;pendingFocus.current=null;setExtraction(null);submit.current(false);
  dial.current={file,p,from:wheel.current,delta:dialDelta(p.a+half/p.r+angles.current[p.track]+wheel.current),start:performance.now()};wake.current();
 }
 useEffect(()=>{
  if(logo)return;const w=new Worker(new URL('./orbit.worker.ts',import.meta.url),{type:'module'});worker.current=w;
  let bitmap:ImageBitmap|null=null,frame=0,last=0,dirty=true,resolution=1400;
  const canvas=ring.current!,ctx=canvas.getContext('2d')!;canvas.width=canvas.height=resolution;
  const clips=Array.from({length:TRACKS},(_,i)=>{const r=INNER_RADIUS+i*TRACK_GAP,p=new Path2D();p.arc(0,0,r+13,0,Math.PI*2);p.arc(0,0,r-3,0,Math.PI*2,true);return p;});
  submit.current=(hide=false)=>w.postMessage({resolution,files:latest.current.slice(0,1200),selected:selectedRef.current,hide,angles:angles.current,scale:parseFloat(box.current?.style.getPropertyValue('--disk-size')||'1020')/1700});
  function paint(){if(!bitmap)return;ctx.resetTransform();ctx.clearRect(0,0,resolution,resolution);ctx.translate(resolution/2,resolution/2);ctx.scale(resolution/1700,resolution/1700);ctx.imageSmoothingQuality="high";
   for(let i=0;i<TRACKS;i++){ctx.save();ctx.clip(clips[i]);ctx.rotate(angles.current[i]+wheel.current);ctx.drawImage(bitmap,-850,-850,1700,1700);ctx.restore();}
   ctx.strokeStyle='#ffffff40';ctx.lineWidth=.7;for(const r of [CORE_RADIUS-5,CORE_RADIUS]){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();}
   canvas.dataset.angles=JSON.stringify(angles.current);canvas.dataset.wheel=String(wheel.current);
  }
  function draw(now:number){frame=0;if(document.hidden){last=0;return;}if(last&&now-last<40){frame=requestAnimationFrame(draw);return;}
   const dt=last?Math.min((now-last)/1000,.1):0;last=now;
   if(running.current){for(let i=0;i<TRACKS;i++)angles.current[i]+=trackSpeed(i)*dt;dirty=true;}
   const d=dial.current;if(d){const t=matchMedia('(prefers-reduced-motion: reduce)').matches?1:Math.min(1,(now-d.start)/850);wheel.current=d.from+d.delta*(1-Math.pow(1-t,3));dirty=true;
    if(t===1){dial.current=null;if(selectedRef.current===d.file&&box.current){const rect=box.current.getBoundingClientRect(),scale=parseFloat(box.current.style.getPropertyValue('--disk-size'))/1700;submit.current(true);pendingFocus.current={file:d.file,...d.p,rotation:angles.current[d.p.track]+wheel.current,scale,width:rect.width,height:rect.height,offsetX:0,offsetY:0,neighbors:geometry.current};}}
   }
   if(dirty){paint();dirty=false;}if(running.current||dial.current)frame=requestAnimationFrame(draw);else last=0;
  }
  wake.current=()=>{dirty=true;if(!frame&&!document.hidden)frame=requestAnimationFrame(draw);};
  resizeRing.current=()=>{const target=Math.min(2560,Math.max(1400,Math.ceil(parseFloat(box.current?.style.getPropertyValue('--disk-size')||'1020')*Math.min(devicePixelRatio,2)/128)*128));if(target!==resolution){resolution=target;canvas.width=canvas.height=resolution;submit.current(false);}const file=selectedRef.current;if(file&&geometry.current[file])freeze(file,geometry.current[file]);else wake.current();};
  w.onerror=e=>console.error('Ring worker:',e.message);
  w.onmessage=({data})=>{if(data.selected!==selectedRef.current){data.bitmap.close();return;}bitmap?.close();bitmap=data.bitmap;geometry.current=data.positions;if(data.hide&&pendingFocus.current?.file===selectedRef.current){setExtraction(pendingFocus.current);pendingFocus.current=null;}canvas.dataset.hiddenCount=String(data.hiddenCount);canvas.dataset.fileCount=String(Object.keys(data.positions).length);canvas.dataset.target=data.selected||'';canvas.dataset.found=String(!!data.positions[data.selected]);
   if(data.selected&&extracted.current!==data.selected&&data.positions[data.selected])freeze(data.selected,data.positions[data.selected]);wake.current();};
  document.addEventListener('visibilitychange',wake.current);wake.current();
  return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',wake.current);w.terminate();bitmap?.close();worker.current=null;canvas.width=canvas.height=0;wake.current=()=>{};resizeRing.current=()=>{};};
 },[logo]);
 useEffect(()=>{if(selected&&extracted.current!==selected&&geometry.current[selected])freeze(selected,geometry.current[selected]);if(!selected){extracted.current='';dial.current=null;setExtraction(null);}if(!selected||dial.current||extracted.current!==selected)submit.current(false);wake.current();},[files,selected]);
 useEffect(()=>{
  const canvas=core.current!,c=canvas.getContext('2d')!;let size=0,frame=0,last=0,angle=0;
  const vertices:number[][]=[],edges:number[][]=[];
  {vertices.push([0,-1.3,0],[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,1.3,0]);edges.push([0,1],[0,2],[0,3],[0,4],[5,1],[5,2],[5,3],[5,4],[1,2],[2,3],[3,4],[4,1]);}

  function paint(){c.clearRect(0,0,size,size);const r=size*(logo?.28:.20),x=size/2,y=size/2,p=vertices.map(([a,b,z])=>{const xx=a*Math.cos(angle)+z*Math.sin(angle),zz=-a*Math.sin(angle)+z*Math.cos(angle);return[x+xx*r,y+(b*Math.cos(.28)-zz*Math.sin(.28))*r,zz];});c.lineWidth=.7;for(const[a,b]of edges){c.strokeStyle=`rgba(255,255,255,${.25+(p[a][2]+p[b][2]+2)*.17})`;c.beginPath();c.moveTo(p[a][0],p[a][1]);c.lineTo(p[b][0],p[b][1]);c.stroke();}}
  const ro=new ResizeObserver(()=>{if(!box.current)return;const r=box.current.getBoundingClientRect(),outer=Math.min(r.width*.48,r.height*.85);size=logo?r.width:outer*(CORE_RADIUS*2)/795;box.current!.style.setProperty('--disk-size',`${outer*1700/795}px`);box.current!.style.setProperty('--core-size',`${size}px`);canvas.style.width=canvas.style.height=`${size}px`;const scale=Math.min(devicePixelRatio,2);canvas.width=canvas.height=Math.round(size*scale);c.setTransform(scale,0,0,scale,0,0);paint();resizeRing.current();});ro.observe(box.current!);
  function draw(t:number){frame=0;if(document.hidden||!running.current){last=0;return;}if(last&&t-last<40){frame=requestAnimationFrame(draw);return;}if(last)angle+=Math.min((t-last)/1000,.1)*.16;last=t;paint();frame=requestAnimationFrame(draw);}
  const resume=()=>{if(!frame&&running.current&&!document.hidden)frame=requestAnimationFrame(draw);};document.addEventListener('visibilitychange',resume);box.current!.addEventListener('orbit-resume',resume);resume();
  return()=>{cancelAnimationFrame(frame);ro.disconnect();document.removeEventListener('visibilitychange',resume);box.current?.removeEventListener('orbit-resume',resume);canvas.width=canvas.height=0;};
 },[logo]);
 useEffect(()=>{box.current?.dispatchEvent(new Event('orbit-resume'));wake.current();},[motion]);
 return <div ref={box} className={logo?'logo-orbit':'orbit-layer'} data-playing={motion} data-selected-file={selected}>{!logo&&<><div className="galaxy-backdrop" aria-hidden="true"/><div className="saturn-plane" aria-hidden="true"><img src="./saturn-dust.svg" alt="" className="saturn-dust"/></div><div className="core-shade"/></>}{!logo&&<div className="ring-position"><canvas ref={ring} className="ring-texture" aria-label="Indexed filenames on independently rotating circular tracks"/></div>}{selected&&extraction?.file===selected&&<FileExtraction key={selected} origin={extraction} details={details}/>}<canvas ref={core} className="core-canvas" aria-label="Rotating Horizon rhombus logo"/>{!logo&&<div className="core-machine" title={machine}>{machine||'CONNECTING'}</div>}</div>;
});
