import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as pty from 'node-pty';
import {prepareRemoteShell} from '../electron/remote-bootstrap';
for(const shell of ['bash','zsh'])test(`${shell} starts from a private script without echoed setup and removes its temporary files`,{skip:process.platform==='win32'},async()=>{
 const writes=new Map<string,string>();let root='';const fake={mkdir:(p:any,o:any,cb:any)=>{root=p;assert.equal(o.mode,0o700);cb();},writeFile:(p:any,b:any,o:any,cb:any)=>{assert.equal(o.mode,0o600);writes.set(p,b);cb();},unlink:(_p:any,cb:any)=>cb(),rmdir:(_p:any,cb:any)=>cb()};
 const setup=await prepareRemoteShell(fake as any,shell);assert.ok(setup.command);assert.ok(!setup.command.includes('__horizon_edit'));
 const local=await fs.mkdtemp(path.join(os.tmpdir(),'horizon-bootstrap-'));
 try{
  for(const [p,body]of writes)await fs.writeFile(path.join(local,path.basename(p)),body.replaceAll(root,local),{mode:0o600});
  const proc=pty.spawn('/bin/'+shell,shell==='bash'?['--noprofile','--rcfile',path.join(local,'init'),'-i']:['-i'],{name:'xterm',cols:100,rows:24,env:{...process.env,HOME:local,ZDOTDIR:local,TERM:'xterm'}});
  let out='';proc.onData(d=>out+=d);
  try{const until=Date.now()+5000;while(Date.now()<until&&!out.includes('\x1b]7;file://horizon'))await new Promise(r=>setTimeout(r,25));assert.ok(out.includes('\x1b]7;file://horizon'),out);assert.ok(!out.includes('__horizon_edit()'),out);await new Promise(r=>setTimeout(r,80));await assert.rejects(fs.stat(local),{code:'ENOENT'});}finally{proc.kill();}
 }finally{await fs.rm(local,{recursive:true,force:true});}
});
