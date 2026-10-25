// One slow/disconnected session must never block another session's work.
export class SessionJobs {
 private running=new Set<string>();
 async run(key:string,task:()=>Promise<void>){
  if(this.running.has(key))return;
  this.running.add(key);
  try{await task();}finally{this.running.delete(key);}
 }
}
export function withTimeout<T>(work:Promise<T>,ms:number,message:string,onTimeout=()=>{}):Promise<T>{
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{reject(new Error(message));onTimeout();},ms);
  work.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
 });
}
