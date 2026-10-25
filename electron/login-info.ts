import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {isIP} from 'node:net';
const exec=promisify(execFile);
export type LoginInfo={user?:string;time?:string;ip?:string;location?:string;source?:string;error?:string};
export function parseLast(text:string):LoginInfo{
 for(const line of text.split('\n')){
  const m=line.trim().match(/^(\S+)\s+(\S+)\s+(.*?)\s*((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+.*)$/);
  if(!m||['reboot','shutdown','wtmp','btmp'].includes(m[1]))continue;
  const source=m[3].trim();return {user:m[1],time:m[4].replace(/\s+(?:still logged in|gone - no logout).*$/,'').split(/\s+-\s+/)[0].trim(),ip:isIP(source)&&source!=='0.0.0.0'?source:undefined,source:source||undefined,location:!source||source==='0.0.0.0'||source===':0'?'LOCAL CONSOLE':`REMOTE / ${m[2]}`};
 }
 return {error:'No readable login record'};
}
export const loginCommand="LC_ALL=C last -w -i -F -n 10 2>/dev/null || LC_ALL=C last -10 2>/dev/null";
export async function localLogin():Promise<LoginInfo>{
 if(process.platform==='win32'){
  const script=`$ErrorActionPreference='Stop'; $e=Get-WinEvent -LogName Security -FilterXPath '*[System[EventID=4624] and EventData[Data[@Name="LogonType"]="2" or Data[@Name="LogonType"]="10"]]' -MaxEvents 1; $x=[xml]$e.ToXml(); $d=@{}; foreach($v in $x.Event.EventData.Data){$d[$v.Name]=$v.'#text'}; @{user=$d.TargetUserName;time=$e.TimeCreated.ToString('o');ip=$d.IpAddress;location= $(if($d.LogonType -eq '10'){'REMOTE DESKTOP'}else{'LOCAL CONSOLE'})} | ConvertTo-Json -Compress`;
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout:5000,maxBuffer:65536});const v=JSON.parse(stdout);return {user:v.user,time:v.time,ip:isIP(v.ip||'')?v.ip:undefined,location:v.location};
 }
 const {stdout}=await exec('last',process.platform==='darwin'?['-10']:['-w','-i','-F','-n','10'],{timeout:5000,maxBuffer:65536,env:{...process.env,LC_ALL:'C'}});return parseLast(stdout);
}
