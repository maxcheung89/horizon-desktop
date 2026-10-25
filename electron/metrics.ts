export type RawCounters = { cpu: number[]; rx: number; tx: number; at: number };
export function rates(previous: RawCounters | undefined, current: RawCounters) {
  if (!previous) return { cpu: null, rx: null, tx: null };
  const dt = (current.at - previous.at) / 1000;
  const total = current.cpu.reduce((a,b)=>a+b,0) - previous.cpu.reduce((a,b)=>a+b,0);
  const idle = (current.cpu[3] + (current.cpu[4] || 0)) - (previous.cpu[3] + (previous.cpu[4] || 0));
  return { cpu: total > 0 ? Math.max(0,Math.min(100,100*(1-idle/total))) : null,
    rx: dt > 0 && current.rx >= previous.rx ? (current.rx-previous.rx)/dt : null,
    tx: dt > 0 && current.tx >= previous.tx ? (current.tx-previous.tx)/dt : null };
}
export function parseLinux(text: string, at = Date.now()) {
  const [stat, mem, net, disk] = text.split('__HORIZON__');
  if (!stat?.startsWith('cpu ') || !mem || !net || !disk) throw new Error('Remote telemetry requires Linux /proc and df.');
  const cpu = stat.trim().split(/\s+/).slice(1,9).map(Number);
  const value = (key:string) => Number(mem.match(new RegExp('^'+key+':\\s+(\\d+)', 'm'))?.[1] || 0)*1024;
  let rx=0,tx=0;
  for (const line of net.split('\n')) { const [name,data]=line.split(':'); if(!data || name.trim()==='lo')continue; const v=data.trim().split(/\s+/).map(Number); rx+=v[0];tx+=v[8]; }
  const d = disk.trim().split('\n').at(-1)!.trim().split(/\s+/);
  const total=value('MemTotal'), available=value('MemAvailable') || value('MemFree');
  if(cpu.some(v=>!Number.isFinite(v)) || !total || !Number.isFinite(Number(d[1]))) throw new Error('Remote counters could not be parsed.');
  return { raw:{cpu,rx,tx,at}, memory:{total,used:total-available}, disks:[{mount:'/',total:Number(d[1])*1024,used:Number(d[2])*1024}] };
}
