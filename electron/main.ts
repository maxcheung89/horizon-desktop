import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import * as pty from 'node-pty';
import si from 'systeminformation';
import {SerialPort} from 'serialport';
import {SerialConfig,serialConfig,serialOptions} from './serial-config';
import {openSerialPort} from './serial-open';
import {hostKeyStatus} from './known-hosts';
import {Logs} from './logs';
import {StringDecoder} from 'node:string_decoder';
import { Client, ClientChannel, SFTPWrapper } from 'ssh2';
import { rates, parseLinux, RawCounters } from './metrics';
import {FileIndexer,directoryPage} from "./file-index";
import {TerminalFlow} from './terminal-flow';
import {SessionJobs,withTimeout} from './session-jobs';
import {shellIntegration,powershellIntegration,installShellIntegration} from './shell-integration';
import {prepareRemoteShell} from './remote-bootstrap';
import {regressionCheck} from './regression-check';
import {localNetwork,parseRemoteNetwork,remoteNetworkCommand,NetworkInfo} from './network-info';
import {renameProfile} from './profile-names';
import {localLogin,parseLast,loginCommand,LoginInfo} from './login-info';
import {performanceCheck} from './performance-check';

type Profile = {id:string;name:string;host:string;port:number;username:string;password?:string;privateKeyPath?:string;secret?:string;fingerprint?:string};
type Session = {parentId?:string;machine?:string;fileDetails?:{size?:number;modified?:number;error?:string};workingFile?:string;editorPid?:number;flow?:TerminalFlow;id:string;name:string;kind:'local'|'ssh'|'serial';serial?:SerialPort;cwd:string;shell:string;process?:pty.IPty;client?:Client;stream?:ClientChannel;sftp?:SFTPWrapper;previous?:RawCounters;buffer:string;osc:string;closed:boolean;profile?:Profile;index?:{files:string[];count:number;done:boolean;limited:boolean;skipped:number}};
const networkCache=new Map<string,NetworkInfo>(),networkPending=new Map<string,Promise<NetworkInfo>>();
let deviceIndex:FileIndexer;
let indexSent="";let lastFiles="";
const listingCache=new Map<string,{mtime:number;at:number;items:any[]}>();
let diskCache:Awaited<ReturnType<typeof si.fsSize>>=[];let diskReadAt=0;
const telemetryJobs=new SessionJobs(),explorerJobs=new SessionJobs();
let logs:Logs;let serialProfiles:SerialConfig[]=[];
let win:BrowserWindow;let active='';let profiles:Profile[]=[];
const sessions=new Map<string,Session>();
const send=(channel:string,data:unknown)=>{if(win&&!win.isDestroyed())win.webContents.send(channel,data);};
const publicSession=(s:Session)=>({id:s.id,parentId:s.parentId,name:s.name,machine:s.machine||s.profile?.host||s.name,kind:s.kind,cwd:s.cwd,shell:s.shell,closed:s.closed,workingFile:s.workingFile,fileDetails:s.fileDetails});
const publish=()=>send('sessions',[...sessions.values()].map(publicSession));
function session(id:string){const s=sessions.get(id);if(!s)throw new Error('Unknown session');return s;}
function closeSession(id:string){const s=session(id);for(const child of [...sessions.values()])if(child.parentId===id)closeSession(child.id);s.closed=true;s.flow?.close();s.process?.kill();s.client?.end();if(s.serial?.isOpen)s.serial.close();logs.stop(id);sessions.delete(id);networkCache.delete(id);if(active===id)active=s.parentId&&sessions.has(s.parentId)?s.parentId:[...sessions.keys()][0]||'';publish();}
function output(s:Session,data:string){
 s.buffer=(s.buffer+data).slice(-200000);s.flow?.push(data);logs?.output(s.id,data);if(s.kind==='serial')return;
 s.osc=(s.osc+data).slice(-32768);
 let end=0;const fileRe=/\x1b\]777;horizon-(file|gui);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;let fileMatch;
 while((fileMatch=fileRe.exec(s.osc))){try{const parts=fileMatch[2].split(';');s.editorPid=fileMatch[1]==='gui'&&s.kind==='local'?Number(parts.shift()):undefined;const file=decodeURIComponent(parts.join(';'));s.workingFile=file?(s.kind==='ssh'?path.posix:path).normalize(file):undefined;s.fileDetails=undefined;publish();if(s.workingFile)void fileDetails(s,s.workingFile);}catch{}end=Math.max(end,fileRe.lastIndex);}
 const re=/\x1b\]7;file:\/\/[^/]*(\/[^\x07\x1b]*)(?:\x07|\x1b\\)/g;let m;
 while((m=re.exec(s.osc))){try{let cwd=decodeURIComponent(m[1]);if(process.platform==='win32'&&s.kind==='local')cwd=cwd.replace(/^\/([A-Za-z]:)/,'$1');if(s.cwd!==cwd){s.cwd=cwd;publish();if(active===s.id)void refresh();}}catch{}end=Math.max(end,re.lastIndex);}
 if(end)s.osc=s.osc.slice(end);
}
async function fileDetails(s:Session,file:string){
 try{
  const stat=s.kind==='local'?await fs.stat(file):await withTimeout(new Promise<{size:number;mtime:number}>((resolve,reject)=>s.sftp!.stat(file,(e,a)=>e?reject(e):resolve(a))),5000,'File information unavailable');
  if(s.workingFile!==file)return;s.fileDetails={size:stat.size,modified:'mtimeMs' in stat?stat.mtimeMs:stat.mtime*1000};
 }catch{if(s.workingFile!==file)return;s.fileDetails={error:'NEW OR UNAVAILABLE FILE'};}
 publish();
}
async function saveProfiles(value=profiles){await fs.writeFile(path.join(app.getPath('userData'),'connections.json'),JSON.stringify(value),{mode:0o600});}
function visibleProfiles(){return profiles.map(({password,secret,...p})=>({...p,hasPassword:!!secret}));}
async function startSerial(value:unknown){
 const config=serialConfig(value);if([...sessions.values()].some(s=>!s.closed&&s.serial?.path===config.path))throw new Error('This serial port is already connected in another tab.');
 const port=new SerialPort(serialOptions(config));const s:Session={id:randomUUID(),name:config.name,kind:'serial',cwd:'',shell:config.path+' · '+config.baudRate,buffer:'',osc:'',closed:false,serial:port};
 const decoder=new StringDecoder('utf8');s.flow=new TerminalFlow(data=>send('terminal:data',{id:s.id,data}),()=>port.pause(),()=>port.resume());
 port.on('data',(data:Buffer)=>output(s,decoder.write(data)));port.on('error',e=>{logs.add('Serial port error',s.name,s.id);send('session:error',{id:s.id,error:e.message});});
 port.on('close',()=>{s.closed=true;s.flow?.close();logs.stop(s.id);logs.add('Serial disconnected',s.name,s.id);publish();});
 try{await openSerialPort(port);}catch(e){s.flow.close();logs.add('Serial connection failed',s.name);throw e;}
 sessions.set(s.id,s);active=s.id;logs.add('Serial connected',s.name,s.id);publish();return publicSession(s);
}
async function startLocal(cwd=os.homedir(),parentId?:string){
 const id=randomUUID();
 const shell=process.platform==='win32'?'powershell.exe':process.env.SHELL||'/bin/zsh';
 const base=path.basename(shell).toLowerCase();const env={...process.env,TERM:'xterm-256color',COLORTERM:'truecolor'} as Record<string,string>;
 delete env.ELECTRON_RUN_AS_NODE;
 let args:string[]=[];
 const hooks=path.join(app.getPath('userData'),'shell-hooks');await fs.mkdir(hooks,{recursive:true});
 if(base==='zsh'){
  env.HORIZON_ORIGINAL_ZDOTDIR=process.env.ZDOTDIR||os.homedir();env.ZDOTDIR=hooks;
  await fs.writeFile(path.join(hooks,'.zshenv'),'[[ -f "$HORIZON_ORIGINAL_ZDOTDIR/.zshenv" ]] && source "$HORIZON_ORIGINAL_ZDOTDIR/.zshenv"\n');
  await fs.writeFile(path.join(hooks,'.zshrc'),'[[ -f "$HORIZON_ORIGINAL_ZDOTDIR/.zshrc" ]] && source "$HORIZON_ORIGINAL_ZDOTDIR/.zshrc"\n'+shellIntegration('zsh'));
  for(const file of ['.zprofile','.zlogin'])await fs.writeFile(path.join(hooks,file),`[[ -f "$HORIZON_ORIGINAL_ZDOTDIR/${file}" ]] && source "$HORIZON_ORIGINAL_ZDOTDIR/${file}"\n`);
  args=['-l','-i'];
 }else if(base==='bash'){
  const rc=path.join(hooks,'bashrc');await fs.writeFile(rc,'[[ -f ~/.bashrc ]] && source ~/.bashrc\n'+shellIntegration('bash'));args=['--rcfile',rc,'-i'];
 }else if(process.platform==='win32')args=['-NoLogo','-NoExit','-Command',powershellIntegration];
 const s:Session={id,parentId,name:process.platform==='win32'?'Local PowerShell':'Local Terminal',kind:'local',cwd,shell:base,buffer:'',osc:'',closed:false};
 const proc=pty.spawn(shell,args,{name:'xterm-256color',cols:100,rows:24,cwd,env});s.process=proc;s.flow=new TerminalFlow(data=>send('terminal:data',{id:s.id,data}),()=>proc.pause(),()=>proc.resume());sessions.set(id,s);active=id;
 logs.add('Connected',s.name,s.id);proc.onData(d=>output(s,d));proc.onExit(()=>{s.closed=true;logs.stop(s.id);logs.add('Disconnected',s.name,s.id);publish();});publish();void deviceIndex.start().then(()=>deviceIndex.save(path.join(app.getPath('userData'),'file-index.json')));return publicSession(s);
}
const remoteCommand="head -n 1 /proc/stat; printf '__HORIZON__'; cat /proc/meminfo; printf '__HORIZON__'; cat /proc/net/dev; printf '__HORIZON__'; df -Pk /";
function remoteExec(s:Session,command:string):Promise<string>{
 let channel:ClientChannel|undefined,expired=false;
 const work=new Promise<string>((resolve,reject)=>s.client!.exec(command,(err,stream)=>{
  if(err)return reject(err);channel=stream;if(expired){stream.close();return;}let out='';
  stream.on('data',(d:Buffer)=>{out+=d.toString();if(out.length>100000){stream.close();reject(new Error('Remote output limit reached'));}});
  stream.on('error',reject);stream.on('close',(code:number)=>code?reject(new Error('Remote monitoring unavailable; Linux /proc required.')):resolve(out));
 }));
 return withTimeout(work,8000,'Remote request timed out',()=>{expired=true;channel?.close();});
}
async function startSSH(id:string,parentId?:string){
 const p=profiles.find(p=>p.id===id);if(!p)throw new Error('Save a connection first.');logs.add('SSH connection requested',p.name);
 const client=new Client();const s:Session={id:randomUUID(),parentId,name:p.name,kind:'ssh',cwd:'/',shell:'ssh',client,buffer:'',osc:'',closed:false,profile:p};
 await new Promise<void>(async(resolve,reject)=>{
  client.on('error',e=>{logs.add('SSH connection error',s.name,s.id);if(!sessions.has(s.id))reject(e);else {output(s,'\r\n'+e.message+'\r\n');send('session:error',{id:s.id,error:e.message});}});
  client.on('close',()=>{s.closed=true;logs.stop(s.id);logs.add('Disconnected',s.name,s.id);publish();});
  client.on('ready',async()=>{try{const info=(await remoteExec(s,"printf '%s\n' \"$SHELL\"; hostname")).trim().split(/\r?\n/);s.shell=path.posix.basename(info[0])||'ssh';s.machine=info[1]?.trim().slice(0,255)||p.host;}catch{}client.sftp(async(err,sftp)=>{if(err){client.end();return reject(err);}s.sftp=sftp;sftp.realpath('.',(e,p)=>{if(!e&&s.cwd==='/'){s.cwd=p;publish();if(active===s.id)void refresh();}});
   let bootstrap:Awaited<ReturnType<typeof prepareRemoteShell>>;try{bootstrap=await prepareRemoteShell(sftp,s.shell);}catch(e){client.end();reject(e);return;}
   const ready=(err:Error|undefined,stream:ClientChannel)=>{if(err){client.end();return reject(err);}s.stream=stream;s.flow=new TerminalFlow(data=>send('terminal:data',{id:s.id,data}),()=>stream.pause(),()=>stream.resume());sessions.set(s.id,s);active=s.id;stream.on('data',(d:Buffer)=>output(s,d.toString()));stream.on('close',()=>{s.closed=true;publish();void bootstrap.cleanup();});logs.add('SSH connected',s.name,s.id);publish();void remoteIndex(s);resolve();};
   if(bootstrap.command)client.exec(bootstrap.command,{pty:{term:'xterm-256color',cols:100,rows:24}},ready);else client.shell({term:'xterm-256color',cols:100,rows:24},ready);
  });});
  try{client.connect({host:p.host,port:p.port,username:p.username,readyTimeout:15000,keepaliveInterval:15000,
   password:p.secret?safeStorage.decryptString(Buffer.from(p.secret,'base64')):undefined,
   privateKey:p.privateKeyPath?await fs.readFile(p.privateKeyPath):undefined,
   hostVerifier:(key:Buffer,cb:(valid:boolean)=>void)=>{
    const fingerprint='SHA256:'+createHash('sha256').update(key).digest('base64').replace(/=+$/,'');
    if(hostKeyStatus(p.fingerprint,fingerprint)!=='unknown'){if(hostKeyStatus(p.fingerprint,fingerprint)==='changed'){logs.add('Blocked: SSH host fingerprint changed',s.name,s.id);send('session:error',{id:s.id,error:'SSH host key changed for '+p.name+'. Verify the fingerprint with the server administrator before changing Known Hosts.'});}cb(hostKeyStatus(p.fingerprint,fingerprint)==='trusted');return;}
    void dialog.showMessageBox(win,{type:'question',title:'Verify SSH host',message:`Trust ${p.host}?`,detail:`SHA-256 fingerprint:\n${fingerprint}\n\nVerify this with the server administrator before connecting.`,buttons:['Cancel','Trust this host'],defaultId:0,cancelId:0}).then(async r=>{if(r.response===1){p.fingerprint=fingerprint;await saveProfiles();logs.add('SSH fingerprint trusted',p.name);cb(true);}else cb(false);}).catch(()=>cb(false));
   }});}catch(e){client.end();reject(e);}
 });return publicSession(s);
}
async function listFiles(s:Session,dir:string){
 if(s.kind==='serial')throw new Error('Serial consoles do not provide a filesystem.');
 if(s.closed)throw new Error('Session disconnected — remote files cannot refresh while offline.');
 if(s.kind==='ssh')return withTimeout(new Promise<any[]>((resolve,reject)=>s.sftp!.readdir(dir,(e,items)=>e?reject(e):resolve(items.slice(0,2000).map(x=>({name:x.filename,directory:x.attrs.isDirectory(),size:x.attrs.size})).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name))))),5000,'Remote directory unavailable — connection timed out.');
 const mtime=(await fs.stat(dir)).mtimeMs,previous=listingCache.get(dir);if(previous&&previous.mtime===mtime&&Date.now()-previous.at<10000)return previous.items;
 const items=(await directoryPage(dir)).items;if(listingCache.size>=8)listingCache.delete(listingCache.keys().next().value!);listingCache.set(dir,{mtime,at:Date.now(),items});return items;
}
async function sample(){
 const local=[...sessions.values()].filter(s=>s.kind==='local'&&!s.closed);
 const tasks:Promise<void>[]=[];
 if(local.length)tasks.push(telemetryJobs.run('local',async()=>{try{
  if(Date.now()-diskReadAt>30000){diskCache=await si.fsSize();diskReadAt=Date.now();}
  const [cpu,mem,net]=await Promise.all([si.currentLoad(),si.mem(),si.networkStats()]);
  const usable=net.filter(n=>!/^lo\d*$/.test(n.iface));
  const data={at:Date.now(),cpu:cpu.currentLoad,memory:{used:mem.active,total:mem.total},rx:usable.some(n=>n.rx_sec<0)?null:usable.reduce((a,n)=>a+n.rx_sec,0),tx:usable.some(n=>n.tx_sec<0)?null:usable.reduce((a,n)=>a+n.tx_sec,0),disks:diskCache.map(d=>({mount:d.mount,total:d.size,used:d.used})),appMemoryMB:app.getAppMetrics().reduce((n,p)=>n+p.memory.workingSetSize,0)/1024,source:'Operating system'};
  for(const s of local)if(sessions.has(s.id))send('telemetry',{id:s.id,...data});
 }catch(e){for(const s of local)send('telemetry',{id:s.id,at:Date.now(),error:String(e)});}}));
 for(const s of sessions.values()){
  if(s.editorPid){try{process.kill(s.editorPid,0);}catch{s.editorPid=undefined;s.workingFile=undefined;publish();}}
  if(s.kind!=='ssh'||s.closed)continue;
  tasks.push(telemetryJobs.run(s.id,async()=>{try{
   const measured=parseLinux(await remoteExec(s,remoteCommand));if(s.closed||!sessions.has(s.id))return;
   const delta=rates(s.previous,measured.raw);s.previous=measured.raw;send('telemetry',{id:s.id,at:measured.raw.at,...delta,memory:measured.memory,disks:measured.disks,source:s.profile!.host});
  }catch(e){if(sessions.has(s.id))send('telemetry',{id:s.id,at:Date.now(),error:String(e)});}}));
 }
 await Promise.allSettled(tasks);
}
async function remoteIndex(s:Session){
 const files:string[]=[],queue=['/'];let directories=0,skipped=0;const deadline=Date.now()+15000;
 while(queue.length&&files.length<1200&&directories<200&&Date.now()<deadline&&!s.closed){
  const dir=queue.shift()!;directories++;
  try{const entries=await listFiles(s,dir);for(const entry of entries){const full=path.posix.join(dir,entry.name);if(['/proc','/sys','/dev'].includes(full))continue;if(entry.directory){if(queue.length+directories<200)queue.push(full);}else{files.push(full);if(files.length>=1200)break;}}}catch{skipped++;}
  if(directories%10===0)send('index',{id:s.id,files:[...files],count:files.length,done:false,limited:false,skipped});
 }
 if(!s.closed)send('index',{id:s.id,files,count:files.length,done:true,limited:queue.length>0,skipped});
}
async function refresh(){
 if(!active||!sessions.has(active))return;
 const s=session(active);if(s.kind==='serial')return;
 if(s.kind==='local'){const snapshot=deviceIndex.snapshot();const key=s.id+':'+snapshot.revision;if(indexSent!==key){send('index',{id:s.id,...snapshot});indexSent=key;}}
 await explorerJobs.run(s.id,async()=>{
  // Re-read immediately if a prompt changes directory while the previous read is pending.
  let again=true;
  while(again&&sessions.has(s.id)&&active===s.id){again=false;const cwd=s.cwd;
   try{
    const payload={id:s.id,cwd,items:await listFiles(s,cwd)};
    if(s.cwd!==cwd){again=true;continue;}if(active!==s.id)return;
    const signature=JSON.stringify(payload);if(signature!==lastFiles){send('files',payload);lastFiles=signature;}

   }catch(e){if(s.cwd!==cwd){again=true;continue;}if(active===s.id)send('files',{id:s.id,cwd,error:String(e)});}
  }
 });
}
let shuttingDown=false;
async function shutdown(code=0){
 if(shuttingDown)return;shuttingDown=true;deviceIndex?.stop();
 await Promise.all([...sessions.values()].map(s=>new Promise<void>(resolve=>{
  const wasClosed=s.closed;s.closed=true;s.flow?.close();
  if(s.process&&!wasClosed){const timer=setTimeout(resolve,1500);s.process.onExit(()=>{clearTimeout(timer);resolve();});try{s.process.kill();}catch{clearTimeout(timer);resolve();}}
  else if(s.serial?.isOpen){const timer=setTimeout(resolve,1500);s.serial.close(()=>{clearTimeout(timer);resolve();});}else{s.client?.end();resolve();}
 })));
 await logs?.flush();await new Promise(resolve=>setTimeout(resolve,100));app.exit(code);
}
function handle(name:string,fn:(...args:any[])=>unknown){ipcMain.handle(name,(event,...args)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('Untrusted IPC sender');return fn(...args);});}
app.whenReady().then(async()=>{
 logs=new Logs(path.join(app.getPath('userData'),'activity-log.json'));await logs.load();
 try{serialProfiles=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'serial-connections.json'),'utf8')).map(serialConfig);}catch{}
 deviceIndex=new FileIndexer(path.parse(os.homedir()).root,{paused:()=>!!win&&(win.isMinimized()||!win.isVisible())});
 await deviceIndex.load(path.join(app.getPath('userData'),'file-index.json'));
 try{profiles=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'connections.json'),'utf8'));}catch{}
 win=new BrowserWindow({width:1500,height:1000,minWidth:1000,minHeight:720,backgroundColor:'#000000',title:'Horizon',icon:path.join(__dirname,'../dist/icon.png'),webPreferences:{backgroundThrottling:!process.env.HORIZON_PERF,preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
 handle('init',()=>({sessions:[...sessions.values()].map(publicSession),profiles:visibleProfiles(),serialProfiles,platform:process.platform}));
 handle('new-local',()=>startLocal());
 const splitting=new Set<string>();
 handle('split',async(id:string)=>{const source=session(id),root=session(source.parentId||id);if(source.closed)throw Error('Session disconnected');if(source.kind==='serial')throw Error('Serial ports cannot be opened twice. Open a separate connection tab instead.');if(splitting.has(root.id)||[...sessions.values()].some(s=>s.parentId===root.id))throw Error('This tab already has an upper terminal.');splitting.add(root.id);try{const created=source.kind==='local'?await startLocal(source.cwd,root.id):await startSSH(source.profile!.id,root.id);if(!sessions.has(root.id)){closeSession(created.id);throw Error('The original tab was closed.');}return created;}finally{splitting.delete(root.id);}});handle('active',(id:string)=>{if(id)session(id);active=id;void refresh();});
 handle('snapshot',(id:string)=>{const s=session(id);const buffer=s.buffer;s.flow?.attach();return buffer;});
 handle('ack',(id:string)=>sessions.get(id)?.flow?.ack());
 handle('input',(id:string,data:string)=>{if(typeof data!=='string'||data.length>1000000)throw new Error('Invalid input');const s=session(id);if(s.closed)return;if(s.process)s.process.write(data);else if(s.serial){if(s.serial.writableLength+Buffer.byteLength(data)>65536){send('session:error',{id:s.id,error:'Serial write queue is full. Send smaller chunks or wait for the device.'});return;}s.serial.write(data,e=>{if(e)send('session:error',{id:s.id,error:e.message});});}else s.stream?.write(data);});
 handle('resize',(id:string,cols:number,rows:number)=>{if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<2||rows<1||cols>1000||rows>1000)return;const s=session(id);if(s.closed)return;s.process?.resize(cols,rows);s.stream?.setWindow(rows,cols,0,0);});
 handle('close',closeSession);
 handle('browse',async(id:string,dir:string)=>{const s=session(id);if(s.closed)throw new Error('Session disconnected');await listFiles(s,dir);const quote=(v:string)=>"'"+v.replace(/'/g,"'\\''")+"'";const command=s.kind==='local'&&process.platform==='win32'?"Set-Location -LiteralPath '"+dir.replace(/'/g,"''")+"'\r":'cd -- '+quote(dir)+'\r';if(s.process)s.process.write(command);else{s.stream?.write(command);}});
 handle('list',(id:string,dir:string)=>listFiles(session(id),dir));
 const loginCache=new Map<string,{at:number;value:LoginInfo}>();
 handle('last-login',async(id:string)=>{const s=session(id);if(s.kind==='serial')return {error:'Login history unavailable over serial'};if(s.closed)return {error:'Machine disconnected'};const key=s.kind==='local'?'local':s.id,cached=loginCache.get(key);if(cached&&Date.now()-cached.at<60000)return cached.value;let value:LoginInfo;try{value=s.kind==='local'?await localLogin():parseLast(await remoteExec(s,loginCommand));}catch{value={error:'Login records unavailable / access denied'};}if(loginCache.size>64)loginCache.clear();loginCache.set(key,{at:Date.now(),value});return value;});
 handle('network-info',async(id:string)=>{const s=session(id);if(s.kind==='serial')throw new Error('Serial consoles do not report network identity.');if(s.closed)throw new Error('Machine disconnected');const key=s.kind==='local'?'local':s.id,cached=networkCache.get(key);if(cached&&Date.now()-cached.at<30000)return cached;let pending=networkPending.get(key);if(!pending){pending=(s.kind==='local'?withTimeout(localNetwork(),8000,'Network details timed out'):remoteExec(s,remoteNetworkCommand).then(parseRemoteNetwork)).then(info=>{networkCache.set(key,info);return info;}).finally(()=>networkPending.delete(key));networkPending.set(key,pending);}return pending;});
 handle('serial-ports',()=>SerialPort.list());
 handle('serial',startSerial);
 handle('save-serial',async(value:unknown)=>{const p=serialConfig(value);p.id=p.id&&serialProfiles.some(old=>old.id===p.id)?p.id:randomUUID();const next=serialProfiles.filter(old=>old.id!==p.id).concat(p);await fs.writeFile(path.join(app.getPath('userData'),'serial-connections.json'),JSON.stringify(next),{mode:0o600});serialProfiles=next;return serialProfiles;});
 handle('known-hosts',()=>profiles.filter(p=>p.fingerprint).map(({id,name,host,port,fingerprint})=>({id,name,host,port,fingerprint})));
 handle('forget-host',async(id:string)=>{const p=profiles.find(p=>p.id===id);if(!p)throw new Error('Unknown saved host');const r=await dialog.showMessageBox(win,{type:'warning',message:'Forget trusted key for '+p.name+'?',detail:'Existing connections stay open. The next SSH connection will require fingerprint verification again.',buttons:['Cancel','Forget key'],defaultId:0,cancelId:0});if(r.response===1){const current=profiles.find(host=>host.id===id);if(current){current.fingerprint=undefined;await saveProfiles();logs.add('Trusted SSH key removed',current.name);}}return visibleProfiles();});
 handle('logs',(id?:string)=>logs.get(id));
 handle('record-log',(id:string,on:boolean)=>{if(session(id).closed)throw new Error('Session disconnected');logs.toggle(id,!!on);logs.add(on?'Transcript recording started':'Transcript recording stopped',session(id).name,id);return logs.get(id);});
 handle('clear-transcript',(id:string)=>{logs.clear(id);return logs.get(id);});
 handle('export-log',async(id?:string)=>{const data=logs.get(id,true);const text=id?data.text:data.events.map(e=>new Date(e.at).toISOString()+'  '+e.name+'  '+e.event).join('\n');const result=await dialog.showSaveDialog(win,{defaultPath:id?'horizon-session.log':'horizon-activity.log',filters:[{name:'Log files',extensions:['log','txt']}]});if(result.canceled||!result.filePath)return false;await fs.writeFile(result.filePath,text,{mode:0o600});return true;});
 handle('profiles',()=>visibleProfiles());
 handle('rename-profile',async(id:string,name:string)=>{const next=renameProfile(profiles,id,name);await saveProfiles(next);profiles=next;for(const s of sessions.values())if(s.profile?.id===id){s.name=profiles.find(p=>p.id===id)!.name;s.profile={...s.profile,name:s.name};}publish();return visibleProfiles();});
 handle('save-profile',async(p:Profile)=>{if(!p.host?.trim()||!p.username?.trim()||!p.name?.trim()||!Number.isInteger(p.port)||p.port<1||p.port>65535)throw new Error('Enter name, host, username and a valid port.');const old=profiles.find(x=>x.id===p.id);const stored:Profile={id:old?.id||randomUUID(),name:p.name,host:p.host,username:p.username,port:p.port,privateKeyPath:p.privateKeyPath,fingerprint:old?.host===p.host&&old.port===p.port?old.fingerprint:undefined,secret:old?.secret};if(p.password){if(!safeStorage.isEncryptionAvailable()||(process.platform==='linux'&&safeStorage.getSelectedStorageBackend()==='basic_text'))throw new Error('Secure credential storage is unavailable. Use an SSH key.');stored.secret=safeStorage.encryptString(p.password).toString('base64');}profiles=profiles.filter(x=>x.id!==stored.id).concat(stored);await saveProfiles();for(const s of sessions.values())if(s.profile?.id===stored.id){s.name=stored.name;s.profile={...s.profile,name:stored.name};}publish();return visibleProfiles();});
 handle('pick-key',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],title:'Choose SSH private key'});return r.canceled?null:r.filePaths[0];});
 handle('ssh',startSSH);
 handle('transfer',async(id:string,direction:'upload'|'download',remote:string)=>{const s=session(id);if(!s.sftp)throw new Error('Connect to SSH first.');if(direction==='upload'){const d=await dialog.showOpenDialog(win,{properties:['openFile']});if(d.canceled)return;const local=d.filePaths[0],target=path.posix.join(remote,path.basename(local));const exists=await new Promise<boolean>(res=>s.sftp!.stat(target,e=>res(!e)));if(exists){const r=await dialog.showMessageBox(win,{message:`Replace ${target}?`,buttons:['Cancel','Replace'],defaultId:0});if(r.response!==1)return;}await new Promise<void>((res,rej)=>s.sftp!.fastPut(local,target,e=>e?rej(e):res()));}else{const d=await dialog.showSaveDialog(win,{defaultPath:path.posix.basename(remote)});if(d.canceled||!d.filePath)return;await new Promise<void>((res,rej)=>s.sftp!.fastGet(remote,d.filePath!,e=>e?rej(e):res()));}return 'Transfer complete';});
 if(process.env.HORIZON_SMOKE==='1'||process.env.HORIZON_REGRESSION==='1')win.webContents.on('console-message',(_e,level,message)=>{if(level>=2)console.error('Renderer:',message);});
 await win.loadFile(path.join(__dirname,'../dist/index.html'));
 setInterval(()=>void sample(),1000);setInterval(()=>void refresh(),2000);
 if(process.env.HORIZON_REGRESSION==='1'){
  try{await new Promise(r=>setTimeout(r,2000));await regressionCheck(win,startLocal,session,path.join(__dirname,'../release'));console.log('Desktop regression checks passed');}catch(e){console.error(e);await shutdown(1);return;}
  await shutdown();
 }
 if(process.env.HORIZON_PERF){await new Promise(r=>setTimeout(r,1000));await performanceCheck(win,startLocal);await shutdown();}
 if(process.env.HORIZON_SMOKE==='1'){
  await new Promise(r=>setTimeout(r,2000));const s=[...sessions.values()][0]||await startLocal();active=s.id;await sample();await refresh();
  session(s.id).process!.write('printf "HORIZON_PTY_OK\\n"\r');await new Promise(r=>setTimeout(r,1000));
  await new Promise(r=>setTimeout(r,7000));
  const dom=await win.webContents.executeJavaScript('({storage:[...document.querySelectorAll(".storage-grid>span")].map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),text:document.body.innerText,canvases:[...document.querySelectorAll("canvas")].map(c=>({w:c.width,h:c.height,rect:{width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height}}))})');
  await fs.writeFile(path.join(app.getPath('userData'),'smoke.json'),JSON.stringify({pty:session(s.id).buffer.includes('HORIZON_PTY_OK'),cwd:session(s.id).cwd,platform:process.platform,index:deviceIndex.state.count,dom}));
  await win.webContents.executeJavaScript(`document.querySelector('[aria-label="New connection tab"]').click()`);
  await new Promise(r=>setTimeout(r,250));
  const picker=await win.webContents.executeJavaScript('({visible:!!document.querySelector(".connection-picker"),local:document.querySelector(".connection-picker")?.textContent})');
  await fs.writeFile(path.join(app.getPath('userData'),'picker-smoke.json'),JSON.stringify({picker,sessions:sessions.size}));
  const image=await win.webContents.capturePage();await fs.writeFile(path.join(app.getPath('userData'),'smoke.png'),image.toPNG());await shutdown();
 }
});
app.on('before-quit',event=>{event.preventDefault();void shutdown();});
app.on('window-all-closed',()=>app.quit());
