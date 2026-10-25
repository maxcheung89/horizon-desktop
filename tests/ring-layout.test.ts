import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutRing,frozenAnchor,TRACKS,TRACK_GAP,INNER_RADIUS,FONT_SIZE,selectionConflicts,trackPhase,trackSpeed,dialDelta} from '../src/ring-layout';
test('dense rings reserve non-overlapping arcs, including long and Unicode names',()=>{
 const files=Array.from({length:1200},(_,i)=>`/path/${i%3===0?'文件名字'.repeat(8):'long-file-name'.repeat(4)}-${i}.txt`),positions=layoutRing(files);
 assert.ok(Object.keys(positions).length>100);
 for(let track=0;track<TRACKS;track++){
  const row=Object.values(positions).filter(p=>p.track===track).sort((a,b)=>a.a-b.a);
  for(let i=0;i<row.length;i++){assert.equal(row[i].r,INNER_RADIUS+track*TRACK_GAP);assert.equal(row[i].size,FONT_SIZE);assert.ok(row[i].a+row[i].span<Math.PI*2);if(i)assert.ok(row[i-1].a+row[i-1].span<=row[i].a);}
 }
});
test('existing paths retain their slots when order changes and a file is selected',()=>{
 const files=Array.from({length:100},(_,i)=>`/home/file-${i}.txt`),before=layoutRing(files),after=layoutRing(files.slice().reverse(),before,files[40]);
 assert.deepEqual(before,after);
 const added=layoutRing([...files,'/new.txt'],before);for(const file of files)assert.deepEqual(added[file],before[file]);
});
test('selected files always get a non-overlapping slot even when the ring is full',()=>{
 const files=Array.from({length:1200},(_,i)=>`/home/${'long-name'.repeat(9)}-${i}`),before=layoutRing(files),selected='/tmp/new-file.txt',after=layoutRing([selected,...files],before,selected);
 assert.ok(after[selected]);for(const p of Object.values(after)){if(p===after[selected]||p.track!==after[selected].track)continue;assert.ok(p.a+p.span<=after[selected].a||p.a>=after[selected].a+after[selected].span);}
});
test('a frozen anchor stays on its original radius and zoom conflicts are detected',()=>{
 const p=layoutRing(['/tmp/notes.txt'])['/tmp/notes.txt'],a=frozenAnchor(p,1.7,.7,1500,600);
 assert.ok(Math.abs(Math.hypot(a.x-1500*.5,a.y-600*.5)-p.r*.7)<1e-9);
 assert.ok(selectionConflicts({...p,a:p.a+.01},p,7));assert.ok(!selectionConflicts({...p,r:p.r+100},p,7));
});

test('tracks are staggered, counter-rotate, and dial to two oclock by the shortest arc',()=>{
 assert.equal(new Set(Array.from({length:TRACKS},(_,i)=>trackPhase(i))).size,TRACKS);
 const directions=Array.from({length:TRACKS},(_,i)=>Math.sign(trackSpeed(i)));assert.ok(directions.includes(1)&&directions.includes(-1));assert.ok(directions.some((d,i)=>i>0&&d===directions[i-1]),'Directions must not simply alternate');
 for(const a of [-20,-4,0,2,35]){const d=dialDelta(a);assert.ok(Math.abs(d)<=Math.PI);assert.ok(Math.abs(Math.sin(a+d)-Math.sin(Math.PI/3))<1e-9);assert.ok(Math.abs(Math.cos(a+d)-.5)<1e-9);}
});
