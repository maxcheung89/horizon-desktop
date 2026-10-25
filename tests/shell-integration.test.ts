import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as pty from 'node-pty';
import {shellIntegration,installShellIntegration} from '../electron/shell-integration';
for(const shell of ['bash','zsh'])test(`${shell} reports actual directory after typed cd, preserving percent signs`,{skip:process.platform==='win32'},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'horizon cwd 100%-'));
 const proc=pty.spawn('/bin/'+shell,shell==='bash'?['--noprofile','--norc','-i']:['-f','-i'],{name:'xterm',cols:100,rows:24,cwd:os.tmpdir(),env:{...process.env,TERM:'xterm'}});
 let output='';proc.onData(data=>output+=data);
 try{
  await installShellIntegration(text=>proc.write(text),shellIntegration(shell));
  proc.write("cd '"+dir+"'\r");
  const expected=dir,until=Date.now()+5000;
  while(Date.now()<until&&!output.includes(expected.replace(/%/g,'%25')+'\x07'))await new Promise(r=>setTimeout(r,30));
  assert.ok(output.includes('\x1b]7;file://horizon'+expected.replace(/%/g,'%25')+'\x07'),output);
 }finally{proc.kill();await fs.rm(dir,{recursive:true,force:true});}
});
for(const shell of ['bash','zsh'])test(`${shell} pins an editor file and clears it on exit without changing its arguments or exit status`,{skip:process.platform==='win32'},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'horizon-editor-'));
 await fs.writeFile(path.join(dir,'nano'),'#!/bin/sh\nprintf "EDITOR_ARGUMENT:%s\\n" "$1"\nsleep 0.2\nexit 7\n',{mode:0o700});
 const proc=pty.spawn('/bin/'+shell,shell==='bash'?['--noprofile','--norc','-i']:['-f','-i'],{name:'xterm',cols:200,rows:24,cwd:dir,env:{...process.env,TERM:'xterm',PATH:dir+':'+process.env.PATH}});
 let output='';proc.onData(data=>output+=data);
 try{
  await installShellIntegration(text=>proc.write(text),shellIntegration(shell));
  proc.write(`nano 'notes 100%.txt'; printf 'EDITOR_EXIT:%s\\n' "$?"\r`);
  const until=Date.now()+5000;while(Date.now()<until&&!output.includes('EDITOR_EXIT:7'))await new Promise(r=>setTimeout(r,30));
  const start=output.indexOf('\x1b]777;horizon-file;'+dir+'/notes 100%25.txt\x07');
  assert.ok(start>=0,output);assert.ok(output.indexOf('\x1b]777;horizon-file;\x07',start)>start,output);
  assert.ok(output.includes('EDITOR_ARGUMENT:notes 100%.txt'),output);assert.ok(output.includes('EDITOR_EXIT:7'),output);
 }finally{proc.kill();await fs.rm(dir,{recursive:true,force:true});}
});
