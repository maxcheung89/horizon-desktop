import {randomUUID} from 'node:crypto';
import {SFTPWrapper} from 'ssh2';
import {shellIntegration} from './shell-integration';
import {withTimeout} from './session-jobs';
export const quoteShell=(value:string)=>"'"+value.replace(/'/g,"'\\''")+"'";
export async function prepareRemoteShell(sftp:SFTPWrapper,shell:string){
 if(!['bash','zsh','fish'].includes(shell))return {command:null,cleanup:async()=>{}};
 const dir='/tmp/horizon-'+randomUUID(),files:string[]=[];
 const call=(run:(done:(e?:Error|null)=>void)=>void)=>withTimeout(new Promise<void>((resolve,reject)=>run(e=>e?reject(e):resolve())),5000,'Remote shell setup timed out');
 await call(done=>sftp.mkdir(dir,{mode:0o700},done));
 const cleanup=async()=>{for(const f of files)await call(done=>sftp.unlink(f,done)).catch(()=>{});await call(done=>sftp.rmdir(dir,done)).catch(()=>{});};
 const remove=(names:string[])=>'\ncommand rm -f -- '+names.map(n=>quoteShell(dir+'/'+n)).join(' ')+'; command rmdir -- '+quoteShell(dir)+' 2>/dev/null\n';
 const write=async(name:string,body:string)=>{const file=dir+'/'+name;files.push(file);await call(done=>sftp.writeFile(file,body,{mode:0o600},done));return file;};
 try{
  if(shell==='zsh'){
   await write('.zshenv','[[ -f "$HOME/.zshenv" ]] && source "$HOME/.zshenv"\n');
   await write('.zshrc','[[ -f "$HOME/.zshrc" ]] && source "$HOME/.zshrc"\n'+shellIntegration(shell)+remove(['.zshenv','.zshrc']));
   return {command:`env ZDOTDIR=${quoteShell(dir)} zsh -i`,cleanup};
  }
  const file=await write('init',(shell==='bash'?'[[ -f ~/.bashrc ]] && source ~/.bashrc\n':'')+shellIntegration(shell)+remove(['init']));
  return {command:shell==='bash'?`exec bash --rcfile ${quoteShell(file)} -i`:`exec fish -i -C ${quoteShell('source '+quoteShell(file))}`,cleanup};
 }catch(e){await cleanup();throw e;}
}
