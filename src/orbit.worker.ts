import {layoutRing,advance,INNER_RADIUS,CORE_RADIUS,TRACKS,TRACK_GAP,RingPosition} from './ring-layout';
const glyphs=new Map<string,OffscreenCanvas>();
function glyph(ch:string,size:number){const key=size+':'+ch;let g=glyphs.get(key);if(!g){g=new OffscreenCanvas(60,72);const c=g.getContext('2d')!;c.scale(3,3);c.font=`900 ${size}px monospace`;c.textAlign='center';c.fillStyle='#fff';c.fillText(ch,10,16);if(glyphs.size>=512)glyphs.delete(glyphs.keys().next().value!);glyphs.set(key,g);}return g;}
let assigned:Record<string,RingPosition>={};
self.onmessage=(event:MessageEvent<{files:string[];selected?:string;hide?:boolean;scale?:number;resolution?:number;angles?:number[]}>)=>{
 const resolution=Math.min(2560,Math.max(1400,event.data.resolution||1400));const texture=new OffscreenCanvas(resolution,resolution),d=texture.getContext('2d')!;
 d.scale(resolution/1700,resolution/1700);d.translate(850,850);d.textAlign='center';
 const {files,selected,hide}=event.data;const positions=assigned=layoutRing(files,assigned,selected);
 for(const [full,p] of Object.entries(positions)){
  if(hide&&selected&&positions[selected]&&p.track===positions[selected].track)continue;
  const name=p.text;let a=p.a;
  d.globalAlpha=.55+(p.track%7)*.06;
  for(const ch of name){d.save();d.rotate(a);d.translate(0,-p.r);d.drawImage(glyph(ch,p.size),-10,-16,20,24);d.restore();a+=advance(ch,p.size)/p.r;}
 }
 d.globalAlpha=.25;d.strokeStyle='#fff';d.lineWidth=.7;
 for(let j=0;j<TRACKS;j+=4){d.beginPath();d.arc(0,0,INNER_RADIUS+4+j*TRACK_GAP,0,Math.PI*2);d.stroke();}
 for(const r of [CORE_RADIUS-5,CORE_RADIUS]){d.beginPath();d.arc(0,0,r,0,Math.PI*2);d.stroke();}
 const hiddenCount=hide&&selected&&positions[selected]?Object.values(positions).filter(p=>p.track===positions[selected].track).length:0;const bitmap=texture.transferToImageBitmap();self.postMessage({bitmap,positions,selected,hide,hiddenCount,focusPositions:positions},{transfer:[bitmap]});texture.width=texture.height=0;
};
