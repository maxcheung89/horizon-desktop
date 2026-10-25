import {useEffect,useState} from 'react';
import {api,Session} from './types';
import type {LoginInfo} from '../electron/login-info';
export function LastLogin({session}:{session?:Session}){
 const [info,setInfo]=useState<LoginInfo>();
 useEffect(()=>{let cancelled=false;setInfo(undefined);if(!session)return;api.invoke('last-login',session.id).then(v=>{if(!cancelled)setInfo(v);}).catch(()=>{if(!cancelled)setInfo({error:'Login records unavailable'});});return()=>{cancelled=true;};},[session?.id,session?.closed]);
 return <aside className="last-login" aria-label="Most recent machine login" title="Latest available operating-system login record. Location describes the recorded access source, not geographic geolocation."><h2>LAST LOGIN</h2>{!info?<small>READING LOGIN RECORD…</small>:info.error?<small>{info.error}</small>:<><div><span>WHO</span><strong>{info.user||'UNAVAILABLE'}</strong></div><div><span>WHEN</span><strong>{info.time||'UNAVAILABLE'}</strong></div><div><span>LOCATION</span><strong>{[info.location,info.source&&!info.ip?info.source:''].filter(Boolean).join(' · ')||'UNAVAILABLE'}</strong></div><div><span>IP</span><strong>{info.ip||'NOT RECORDED'}</strong></div></>}</aside>;
}
