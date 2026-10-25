export type SerialConfig={id?:string;name:string;path:string;baudRate:number;dataBits:5|6|7|8;stopBits:1|1.5|2;parity:'none'|'even'|'odd'|'mark'|'space';flowControl:'none'|'hardware'|'software'};
export function serialConfig(value:unknown):SerialConfig{
 const p=value as SerialConfig;
 if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>64||typeof p.path!=='string'||!p.path.trim()||p.path.length>512||/[\x00-\x1f]/.test(p.path)||!Number.isInteger(p.baudRate)||p.baudRate<50||p.baudRate>4000000||![5,6,7,8].includes(p.dataBits)||![1,1.5,2].includes(p.stopBits)||!['none','even','odd','mark','space'].includes(p.parity)||!['none','hardware','software'].includes(p.flowControl))throw new Error('Check serial name, port path and connection settings.');
 return {id:typeof p.id==='string'?p.id:undefined,name:p.name.trim(),path:p.path.trim(),baudRate:p.baudRate,dataBits:p.dataBits,stopBits:p.stopBits,parity:p.parity,flowControl:p.flowControl};
}
export function serialOptions(p:SerialConfig){return {path:p.path,baudRate:p.baudRate,dataBits:p.dataBits,stopBits:p.stopBits,parity:p.parity,rtscts:p.flowControl==='hardware',xon:p.flowControl==='software',xoff:p.flowControl==='software',autoOpen:false};}
