// Hooks exist only in this interactive session; remote dotfiles are never changed.
export function shellIntegration(shell:string){
 const common="\n__horizon_escape() { local p=\"$1\"; p=\"${p//\\%/%25}\"; p=\"${p//$'\\033'/%1B}\"; p=\"${p//$'\\007'/%07}\"; p=\"${p//$'\\n'/%0A}\"; p=\"${p//$'\\r'/%0D}\"; printf '%s' \"$p\"; }\n__horizon_cwd() { printf '\\033]7;file://horizon%s\\007' \"$(__horizon_escape \"$PWD\")\"; }\n__horizon_edit() {\n local editor=\"$1\" file='' arg skip=0 options=1; shift\n for arg in \"$@\"; do\n  if [ \"$skip\" = 1 ]; then skip=0; continue; fi\n  if [ \"$options\" = 1 ]; then\n   case \"$arg\" in --) options=0; continue;; -c|-u|-U|-i|-T|-t|-s|-S|--rcfile|--syntax|--tabsize|--operatingdir) skip=1; continue;; -*|+*) continue;; esac\n  fi\n  file=\"$arg\"; break\n done\n if [ -n \"$file\" ]; then\n  case \"$file\" in /*) ;; *) file=\"$PWD/$file\";; esac\n  printf '\\033]777;horizon-file;%s\\007' \"$(__horizon_escape \"$file\")\"\n fi\n command \"$editor\" \"$@\"; local result=$?\n printf '\\033]777;horizon-file;\\007'\n return \"$result\"\n}";
 const wrappers=['nano','vi','vim','nvim','emacs'].map(name=>`if ! typeset -f ${name} >/dev/null 2>&1; then function ${name} { __horizon_edit ${name} "$@"; }; fi`).join('\n');
 if(shell==='zsh')return common+'\n'+wrappers+'\nautoload -Uz add-zsh-hook; add-zsh-hook precmd __horizon_cwd; __horizon_cwd\n';
 if(shell==='bash')return common+'\n'+wrappers+`\nif declare -p PROMPT_COMMAND 2>/dev/null | grep -q 'declare -a'; then PROMPT_COMMAND+=(__horizon_cwd); else PROMPT_COMMAND="\${PROMPT_COMMAND:+$PROMPT_COMMAND; }__horizon_cwd"; fi; __horizon_cwd\n`;
 if(shell==='fish')return String.raw`function __horizon_cwd --on-event fish_prompt; printf '\033]7;file://horizon%s\007' (string replace -a '%' '%25' -- "$PWD"); end; __horizon_cwd`+'\n';
 return '';
}
export const powershellIntegration=String.raw`
function global:prompt {
 $u = ([System.Uri](Get-Location).Path).AbsoluteUri
 [Console]::Write("$([char]27)]7;$u$([char]7)")
 "PS $((Get-Location).Path)> "
}
function global:notepad {
 param([Parameter(ValueFromRemainingArguments=$true)][string[]]$FileArgs)
 $exe = (Get-Command notepad.exe -CommandType Application).Source
 if ($FileArgs.Count -eq 1 -and !$FileArgs[0].StartsWith('/')) {
  $file = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($FileArgs[0])
  $p = Start-Process -FilePath $exe -ArgumentList ('"' + $file + '"') -PassThru
  [Console]::Write("$([char]27)]777;horizon-gui;$($p.Id);$([Uri]::EscapeDataString($file))$([char]7)")
 } else { & $exe @FileArgs }
}
`;

// Pace installation so the remote PTY's initial canonical input buffer cannot overflow.
export async function installShellIntegration(write:(text:string)=>void,script:string){
 await new Promise(resolve=>setTimeout(resolve,100));
 for(const line of script.split('\n')){
  if(line)write(line+'\r');
  await new Promise(resolve=>setTimeout(resolve,20));
 }
}
