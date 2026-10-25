import {memo,useState,useRef,useEffect} from 'react';
import {Folder,File} from 'lucide-react';
import {bytes,FileEntry} from './types';
export const FileList=memo(function FileList({items,open}:{items:FileEntry[];open:(file:FileEntry)=>void}){
 const ref=useRef<HTMLDivElement>(null),[top,setTop]=useState(0),[height,setHeight]=useState(200);
 useEffect(()=>{const observer=new ResizeObserver(()=>setHeight(ref.current?.clientHeight||200));observer.observe(ref.current!);return()=>observer.disconnect();},[]);
 useEffect(()=>{setTop(0);if(ref.current)ref.current.scrollTop=0;},[items]);
 const first=Math.max(0,Math.floor(top/16)-3),last=Math.min(items.length,first+Math.ceil(height/16)+7);
 return <div ref={ref} className="file-list" onScroll={e=>setTop(e.currentTarget.scrollTop)}><div style={{height:items.length*16,position:'relative'}}><div style={{position:'absolute',top:first*16,left:0,right:0}}>{items.slice(first,last).map(f=><button key={f.name} style={{height:16}} onClick={()=>open(f)}>{f.directory?<Folder size={11}/>:<File size={11}/>}<span>{f.name}</span><small>{f.directory?'DIR':bytes(f.size)}</small></button>)}</div></div></div>;
});
