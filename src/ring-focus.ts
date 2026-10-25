import {RingPosition,textWidth} from './ring-layout';
/** Spread the required extra arc through existing gaps on both sides of the active name. */
export function pushedTrack(positions:Record<string,RingPosition>,selected:string,extra:number){
 const focus=positions[selected];if(!focus)return [];
 const tau=Math.PI*2,width=(p:RingPosition)=>textWidth(p.text,p.size)/p.r;
 const rows=Object.entries(positions).filter(([file,p])=>p.track===focus.track&&file!==selected).map(([file,p])=>({file,p,relative:((p.a-focus.a)%tau+tau)%tau})).sort((a,b)=>a.relative-b.relative);
 const old=width(focus),growth=textWidth(focus.text,focus.size+extra)/focus.r-old;
 const gaps:number[]=[];let edge=old;
 for(const row of rows){gaps.push(Math.max(0,row.relative-edge-2/focus.r));edge=row.relative+width(row.p);}
 gaps.push(Math.max(0,tau-edge-2/focus.r));const available=gaps.reduce((a,b)=>a+b,0),amount=Math.min(growth,available);
 let consumed=0;
 return rows.map((row,i)=>{consumed+=gaps[i];return {file:row.file,...row.p,shift:amount/2-(available?consumed/available*amount:0)};});
}
