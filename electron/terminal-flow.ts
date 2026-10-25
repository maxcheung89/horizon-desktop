/** Wait for xterm to consume each batch before releasing more PTY output. */
export class TerminalFlow{
 private pending='';private inFlight=false;private attached=false;private timer?:ReturnType<typeof setTimeout>;private stopped=false;
 constructor(private send:(data:string)=>void,private pause:()=>void,private resume:()=>void){}
 push(data:string){if(this.stopped)return;this.pending+=data;if(this.pending.length>=65536)this.pause();this.schedule();}
 attach(){this.pending='';this.inFlight=false;this.attached=true;this.resume();}
 ack(){if(this.stopped)return;this.inFlight=false;if(this.pending.length<65536)this.resume();this.schedule();}
 close(){this.stopped=true;clearTimeout(this.timer);this.pending='';}
 private schedule(){if(this.timer||this.inFlight||!this.attached||!this.pending||this.stopped)return;this.timer=setTimeout(()=>{this.timer=undefined;if(this.stopped)return;const chunk=this.pending.slice(0,65536);this.pending=this.pending.slice(chunk.length);this.inFlight=true;this.send(chunk);},16);}
}
