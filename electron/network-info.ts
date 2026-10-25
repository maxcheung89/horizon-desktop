import os from 'node:os';
import dns from 'node:dns';
import {isIP} from 'node:net';
import si from 'systeminformation';
export type NetworkInfo={at:number;interfaces:{name:string;ipv4:string[];ipv6:string[];mac:string}[];defaultInterface?:string;gateway?:string;dns:string[];publicIP?:string;publicError?:string;error?:string};
let publicCache:{at:number;ip?:string;error?:string}|undefined;
export async function localNetwork():Promise<NetworkInfo>{
 const interfaces=Object.entries(os.networkInterfaces()).flatMap(([name,items])=>{const addresses=(items||[]).filter(i=>!i.internal);return addresses.length?[{name,ipv4:addresses.filter(i=>i.family==='IPv4').map(i=>i.address),ipv6:addresses.filter(i=>i.family==='IPv6').map(i=>i.address),mac:addresses.find(i=>i.mac!=='00:00:00:00:00:00')?.mac||''}]:[];});
 const [defaultInterface,gateway]=await Promise.all([si.networkInterfaceDefault().catch(()=>''),si.networkGatewayDefault().catch(()=>'')]);
 if(!publicCache||Date.now()-publicCache.at>300000){try{const response=await fetch('https://api64.ipify.org',{signal:AbortSignal.timeout(3000)});const value=(await response.text()).trim();if(!response.ok||!isIP(value))throw Error('Invalid IP response');publicCache={at:Date.now(),ip:value};}catch{publicCache={at:Date.now(),error:'Public IP lookup unavailable'};}}
 return {at:Date.now(),interfaces,defaultInterface,gateway,dns:dns.getServers(),publicIP:publicCache.ip,publicError:publicCache.error};
}
// Runs on a separate SSH exec channel, never through the visible shell.
export const remoteNetworkCommand=`ip -j address show 2>/dev/null; printf '\\n__HORIZON_NET__\\n'; ip -j route show default 2>/dev/null; printf '\\n__HORIZON_NET__\\n'; cat /etc/resolv.conf 2>/dev/null; printf '\\n__HORIZON_NET__\\n'; if command -v curl >/dev/null 2>&1; then curl -fsS --connect-timeout 2 --max-time 3 https://api64.ipify.org 2>/dev/null; fi; printf '\\n__HORIZON_NET__\\n'; if command -v timeout >/dev/null 2>&1; then timeout 1 resolvectl dns 2>/dev/null; fi; true`;
export function parseRemoteNetwork(text:string):NetworkInfo{
 const [addresses,routes,resolvers,publicAddress,upstream]=text.split('__HORIZON_NET__');
 const json=(s:string|undefined)=>{try{const a=JSON.parse(s||'');return Array.isArray(a)?a:[];}catch{return [];}};
 const interfaces=json(addresses).filter(i=>i.ifname!=='lo'&&(i.addr_info||[]).length).map(i=>({name:String(i.ifname),ipv4:i.addr_info.filter((a:any)=>a.family==='inet'&&isIP(a.local)===4).map((a:any)=>a.local),ipv6:i.addr_info.filter((a:any)=>a.family==='inet6'&&isIP(a.local)===6).map((a:any)=>a.local),mac:typeof i.address==='string'?i.address:''}));
 const route=json(routes)[0];const dnsServers=(resolvers||'').split('\n').filter(l=>/^\s*nameserver\s/.test(l)).map(l=>l.trim().split(/\s+/)[1]).filter(a=>isIP(a));
 const upstreamServers=(upstream||'').split(/\s+/).filter(a=>isIP(a));
 const publicIP=isIP(publicAddress?.trim()||'')?publicAddress.trim():undefined;
 return {at:Date.now(),interfaces,defaultInterface:route?.dev,gateway:route?.gateway,dns:[...new Set(upstreamServers.length?upstreamServers:dnsServers)],publicIP,publicError:publicIP?undefined:'Public IP lookup unavailable',error:interfaces.length?undefined:'Interface details unavailable (remote host needs Linux iproute2)'};
}
