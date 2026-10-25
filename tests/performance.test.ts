import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {FileIndexer,directoryPage} from '../electron/file-index';
import {TerminalFlow} from '../electron/terminal-flow';
test('one scan is shared, sample and directory listing stay bounded, symlinks are skipped',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'horizon-index-'));
 try{for(let i=0;i<25;i++)await fs.writeFile(path.join(root,`file-${i}`),'data');await fs.symlink(root,path.join(root,'loop'));
 const index=new FileIndexer(root,{sampleSize:5,maxFiles:12,batchSize:4,delayMs:1});const a=index.start();assert.equal(index.start(),a);await a;
 assert.equal(index.state.count,12);assert.equal(index.state.files.length,5);assert.equal(index.state.limited,true);
 const first=index.snapshot();assert.equal(first.files,index.snapshot().files);
 const page=await directoryPage(root,7);assert.equal(page.items.length,7);assert.equal(page.truncated,true);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('terminal batches output and waits for consumer acknowledgements',async()=>{
 const sent:string[]=[];let paused=0;const flow=new TerminalFlow(d=>sent.push(d),()=>paused++,()=>{});
 flow.attach();flow.push('a'.repeat(65536));flow.push('tail');assert.ok(paused);
 await new Promise(r=>setTimeout(r,30));assert.equal(sent.length,1);assert.equal(sent[0].length,65536);
 await new Promise(r=>setTimeout(r,30));assert.equal(sent.length,1);
 flow.ack();await new Promise(r=>setTimeout(r,30));assert.deepEqual(sent.map(s=>s.length),[65536,4]);flow.close();flow.push('ignored');
});
