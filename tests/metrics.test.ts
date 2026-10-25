import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLinux,rates} from '../electron/metrics';
test('CPU and traffic use counter deltas, not generated waves',()=>{
 const a={cpu:[100,0,50,850,0,0,0,0],rx:1000,tx:500,at:1000};
 const b={cpu:[130,0,70,900,0,0,0,0],rx:5096,tx:2548,at:3000};
 assert.deepEqual(rates(a,b),{cpu:50,rx:2048,tx:1024});
 assert.deepEqual(rates(undefined,b),{cpu:null,rx:null,tx:null});
 assert.equal(rates(b,{...a,at:4000}).rx,null);
});
test('parses Linux memory, interfaces and storage and excludes loopback',()=>{
 const m=parseLinux('cpu 100 0 50 850 0 0 0 0\n__HORIZON__MemTotal: 8000 kB\nMemAvailable: 3000 kB\n__HORIZON__lo: 99999 0 0 0 0 0 0 0 99999 0\neth0: 1024 0 0 0 0 0 0 0 2048 0\n__HORIZON__Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda 10000 4000 6000 40% /',1000);
 assert.equal(m.memory.used,5000*1024);assert.equal(m.raw.rx,1024);assert.equal(m.raw.tx,2048);assert.equal(m.disks[0].used,4000*1024);
 assert.throws(()=>parseLinux('permission denied'));
});
