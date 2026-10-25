export function FileCallout({file}:{file:string}){
 const name=file.split(/[\\/]/).pop()||file;
 return <aside className="file-callout" role="status" aria-label={`Working on this file: ${file}`}>
  <svg className="file-leader" viewBox="0 0 180 85" aria-hidden="true"><circle cx="5" cy="79" r="3"/><path d="M5 79L65 18H180"/></svg>
  <small>WORKING ON THIS FILE</small><strong title={file}>{name}</strong><span title={file}>{file}</span>
 </aside>;
}
