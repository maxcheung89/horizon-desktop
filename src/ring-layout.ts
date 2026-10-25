export const TRACKS=36,TRACK_GAP=18,FONT_SIZE=11,LETTER_SPACING=.60;
export const INNER_RADIUS=150,CORE_RADIUS=135;
export type RingPosition={a:number;r:number;size:number;track:number;span:number;text:string};
function hash(text:string,seed=2166136261){let h=seed;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0;}
export function displayName(file:string){return (file.split(/[\\/]/).pop()||' ').slice(0,100);}
export function advance(char:string,size:number){return size*((char.codePointAt(0)||0)>255?1.1:LETTER_SPACING);}
export function textWidth(text:string,size:number){return Array.from(text).reduce((sum,char)=>sum+advance(char,size),0);}
/** Retain existing slots, and place new names only in free arc intervals. */
export function layoutRing(files:string[],previous:Record<string,RingPosition>={},selected?:string){
 const wanted=new Set(files),result:Record<string,RingPosition>={};
 for(const [file,p] of Object.entries(previous))if(wanted.has(file))result[file]=p;
 function place(file:string){
  const text=displayName(file),preferred=hash(file)%TRACKS;
  for(let offset=0;offset<TRACKS;offset++){
   const track=(preferred+offset)%TRACKS,r=INNER_RADIUS+track*TRACK_GAP,size=FONT_SIZE,span=(textWidth(text,size)+14)/r;
   const intervals=Object.values(result).filter(p=>p.track===track).sort((a,b)=>a.a-b.a);let edge=.015;const gaps:{start:number;end:number}[]=[];
   for(const p of [...intervals,{a:Math.PI*2-.015,span:0}]){
    if(p.a-edge>=span)gaps.push({start:edge,end:p.a-span});edge=Math.max(edge,p.a+p.span);
   }
   if(gaps.length){const seed=hash(file,1234567),gap=gaps[seed%gaps.length],a=gap.start+(gap.end-gap.start)*((seed>>>8)/16777216);result[file]={a,r,size,track,span,text};return true;}
  }
  return false;
 }
 if(selected&&wanted.has(selected)&&!result[selected]){
  while(!place(selected)){const last=Object.keys(result).at(-1);if(!last)break;delete result[last];}
 }
 for(const file of files)if(!result[file])place(file);
 return result;
}
export function frozenAnchor(p:RingPosition,rotation:number,scale:number,width:number,height:number){
 const a=p.a+rotation;return {x:width*.5+Math.sin(a)*p.r*scale,y:height*.5-Math.cos(a)*p.r*scale};
}
/** Hide only labels intersecting the selected word's enlarged footprint. */
export function selectionConflicts(p:RingPosition,selected:RingPosition,extra:number){
 if(p.r+p.size+2<selected.r-2||p.r-2>selected.r+selected.size+extra+2)return false;
 const oldWidth=textWidth(selected.text,selected.size),expandedWidth=textWidth(selected.text,selected.size+extra);
 const tau=Math.PI*2,selectedAngle=((selected.a%tau)+tau)%tau,pa=((p.a%tau)+tau)%tau;
 const start=selectedAngle-(expandedWidth-oldWidth)/2/selected.r-.01,end=start+expandedWidth/selected.r+.02;
 const pEnd=pa+textWidth(p.text,p.size)/p.r;
 return [-Math.PI*2,0,Math.PI*2].some(shift=>pa+shift<end&&pEnd+shift>start);
}

export const trackPhase=(track:number)=>(hash('track:'+track)/4294967296)*Math.PI*2;
export const trackSpeed=(track:number)=>((hash('direction:'+track)>>>16)&1?-1:1)*(.035+((hash('speed:'+track)>>>8)%5)*.006);
export function dialDelta(angle:number){const tau=Math.PI*2;return ((Math.PI/3-angle+Math.PI)%tau+tau)%tau-Math.PI;}
