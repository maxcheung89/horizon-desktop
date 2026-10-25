import {useEffect,useState} from 'react';import {api,Profile} from './types';
export function KnownHosts({updated}:{updated:(p:Profile[])=>void}){
 const [hosts,setHosts]=useState<Profile[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){try{setHosts(await api.invoke('known-hosts'));}catch(e){setError(String(e));}}
 useEffect(()=>{void refresh();},[]);
 return <div className="known-hosts"><p>Trusted SSH fingerprints saved by Horizon. Changed keys are blocked. Your system known_hosts file is not modified.</p>{error&&<p role="alert">{error}</p>}{!hosts.length&&<p>No trusted keys yet. Verify a fingerprint when first connecting to SSH.</p>}{hosts.map(h=><article key={h.id}><strong>{h.name}</strong><span>{h.host}:{h.port}</span><code>{h.fingerprint}</code><button disabled={busy} onClick={async()=>{setBusy(true);try{updated(await api.invoke('forget-host',h.id));await refresh();}catch(e){setError(String(e));}finally{setBusy(false);}}}>FORGET TRUSTED KEY</button></article>)}</div>;
}
