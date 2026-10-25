import {contextBridge,ipcRenderer} from 'electron';
const channels=new Set(['sessions','terminal:data','telemetry','files','index','session:error']);
contextBridge.exposeInMainWorld('horizon',{
 invoke:(method:string,...args:unknown[])=>{if(!['last-login','split','serial-ports','serial','save-serial','known-hosts','forget-host','logs','record-log','clear-transcript','export-log','init','new-local','active','snapshot','ack','input','resize','close','browse','list','profiles','network-info','save-profile','rename-profile','pick-key','ssh','transfer'].includes(method))throw new Error('Unknown method');return ipcRenderer.invoke(method,...args);},
 on:(channel:string,callback:(data:unknown)=>void)=>{if(!channels.has(channel))throw new Error('Unknown event');const handler=(_event:unknown,data:unknown)=>callback(data);ipcRenderer.on(channel,handler);return()=>ipcRenderer.removeListener(channel,handler);}
});
