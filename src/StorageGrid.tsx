import {useEffect,useRef,useState} from 'react';
import {bytes} from './types';
export function StorageGrid({used,total}:{used:number;total:number}){
 const ref=useRef<HTMLDivElement>(null),[grid,setGrid]=useState({columns:1,rows:1,size:10});
 useEffect(()=>{const observer=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;const columns=Math.max(1,Math.floor((width+2)/12)),rows=Math.max(1,Math.floor((height+2)/12));const size=Math.max(1,Math.min((width-2*(columns-1))/columns,(height-2*(rows-1))/rows));setGrid({columns,rows,size});});if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
 const count=grid.columns*grid.rows,ratio=Math.max(0,Math.min(1,used/total));
 return <><div ref={ref} className="storage-map"><div className="storage-grid" style={{gridTemplateColumns:`repeat(${grid.columns},${grid.size}px)`,gridTemplateRows:`repeat(${grid.rows},${grid.size}px)`}} aria-label={`${(ratio*100).toFixed(1)} percent occupied. ${count} squares.`}>{Array.from({length:count},(_,i)=>{const fraction=Math.max(0,Math.min(1,ratio*count-i));return <span key={i} className={fraction>0?'occupied':'free'} style={{opacity:fraction>0?.32+.68*fraction:1}}><i/></span>;})}</div></div><div className="storage-legend"><span><i/> OCCUPIED</span><span>□ FREE {bytes(total-used)}</span></div><div className="panel-footer">1 SQUARE = {bytes(total/count)}</div></>;
}
