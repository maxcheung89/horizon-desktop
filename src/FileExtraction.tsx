import {useEffect,useRef,useState} from 'react';
import {pushedTrack} from './ring-focus';
import {bytes} from './types';
import {frozenAnchor,advance,textWidth,RingPosition} from './ring-layout';
export type Origin=RingPosition&{file:string;rotation:number;scale:number;width:number;height:number;offsetX:number;offsetY:number;neighbors:Record<string,RingPosition>};
export function FileExtraction({origin,details}:{origin:Origin;details?:{size?:number;modified?:number;error?:string}}){
 const ref=useRef<HTMLCanvasElement>(null),[ready,setReady]=useState(false);
 const name=origin.text,chars=Array.from(name),half=(textWidth(name,origin.size)-advance(chars.at(-1)||' ',origin.size))/2,centerAngle=origin.a+half/origin.r,originalAnchor=frozenAnchor({...origin,a:centerAngle},origin.rotation,origin.scale,origin.width,origin.height),anchor={x:originalAnchor.x+origin.offsetX,y:originalAnchor.y+origin.offsetY};
 useEffect(()=>{
  const canvas=ref.current!,ctx=canvas.getContext('2d')!;let frame=0;const dpr=Math.min(devicePixelRatio,1.5);
  const w=origin.width,h=origin.height;canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);
  const chars=Array.from(name.slice(0,100)),baseFont=origin.size*origin.scale,cx=w*.5+origin.offsetX,cy=h*.5+origin.offsetY;
  const neighbors=pushedTrack(origin.neighbors,origin.file,4/origin.scale);
  const start=performance.now(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function draw(now:number){const t=reduced?1:Math.min(1,(now-start)/700),p=1-Math.pow(1-t,3);ctx.clearRect(0,0,w,h);
   // Keep every glyph on this same radius and freeze the original word-center anchor.
   // Growing angular spacing and font size provides the pop, without moving to another track.
   const magnification=(baseFont+4*p)/baseFont;let offset=-half;
   for(const neighbor of neighbors){let a=neighbor.a+neighbor.shift*p+origin.rotation;ctx.font=`900 ${neighbor.size*origin.scale}px monospace`;ctx.fillStyle=`rgba(255,255,255,${.55+(neighbor.track%7)*.06})`;ctx.textAlign='center';for(const ch of neighbor.text){ctx.save();ctx.translate(cx+Math.sin(a)*neighbor.r*origin.scale,cy-Math.cos(a)*neighbor.r*origin.scale);ctx.rotate(a);ctx.fillText(ch,0,0);ctx.restore();a+=advance(ch,neighbor.size)/neighbor.r;}}

   chars.forEach((ch,i)=>{const angle=centerAngle+offset/origin.r*magnification+origin.rotation;offset+=advance(ch,origin.size);
    const x=cx+Math.sin(angle)*origin.r*origin.scale,y=cy-Math.cos(angle)*origin.r*origin.scale;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.font=`900 ${baseFont*magnification}px monospace`;ctx.textAlign='center';ctx.fillStyle='#fff';ctx.shadowColor='#fff';ctx.shadowBlur=3+12*p;ctx.strokeStyle='rgba(0,0,0,.8)';ctx.lineWidth=2;ctx.fillText(ch,0,0);ctx.restore();
   });
   if(t<1)frame=requestAnimationFrame(draw);else setReady(true);
  }
  frame=requestAnimationFrame(draw);return()=>{cancelAnimationFrame(frame);canvas.width=canvas.height=0;};
 },[origin,name]);
 return <div className="extraction-layer" data-growth-px="4" data-neighbor-count={pushedTrack(origin.neighbors,origin.file,4/origin.scale).length} data-track={origin.track} data-anchor-x={anchor.x} data-anchor-y={anchor.y} data-radius={origin.r*origin.scale} data-angle={centerAngle+origin.rotation}><canvas ref={ref} className="extraction-canvas" aria-label={`Filename frozen on track ${origin.track+1}: ${name}`}/><svg className={'extraction-leader '+(ready?'ready':'')} viewBox={`0 0 ${origin.width} ${origin.height}`} preserveAspectRatio="none"><circle cx={anchor.x} cy={anchor.y} r="2"/><path d={`M${anchor.x} ${anchor.y}L${origin.width*.78} ${origin.height*.2}H${origin.width*.86}`}/></svg><aside className={'file-callout extracted '+(ready?'ready':'')} role="status"><small>WORKING ON THIS FILE · TRACK {origin.track+1}</small><strong>{name}</strong><span>{origin.file}</span><span>{name.includes('.')?name.split('.').pop()?.toUpperCase()+' FILE':'FILE'} · {details?.size!==undefined?bytes(details.size):details?.error||'READING DETAILS…'}</span>{details?.modified!==undefined&&<span>MODIFIED {new Date(details.modified).toLocaleString()}</span>}</aside></div>;
}
