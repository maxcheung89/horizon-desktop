import {withTimeout} from './session-jobs';
type Port={isOpen:boolean;open:(callback:(error:Error|null)=>void)=>void;close:(callback?:()=>void)=>void};
export async function openSerialPort(port:Port,timeout=8000){let expired=false;await withTimeout(new Promise<void>((resolve,reject)=>port.open(error=>{if(expired){if(port.isOpen)port.close();return;}error?reject(error):resolve();})),timeout,'Serial connection timed out',()=>{expired=true;});}
