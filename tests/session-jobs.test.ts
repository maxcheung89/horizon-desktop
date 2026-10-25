import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SessionJobs,withTimeout} from '../electron/session-jobs';
test('stalled remote work cannot block local work; duplicate jobs stay bounded',async()=>{
 const jobs=new SessionJobs();let release!:()=>void,local=0,duplicates=0;
 const stalled=jobs.run('ssh',()=>new Promise<void>(resolve=>release=resolve));
 await jobs.run('ssh',async()=>{duplicates++;});
 await jobs.run('local',async()=>{local++;});
 assert.equal(local,1);assert.equal(duplicates,0);release();await stalled;
 await jobs.run('ssh',async()=>{duplicates++;});assert.equal(duplicates,1);
});
test('timed-out remote requests release their job slot and close resources',async()=>{
 const jobs=new SessionJobs();let closed=false;
 await assert.rejects(jobs.run('ssh',()=>withTimeout(new Promise<void>(()=>{}),15,'offline',()=>{closed=true;})),/offline/);
 assert.equal(closed,true);let recovered=false;await jobs.run('ssh',async()=>{recovered=true;});assert.equal(recovered,true);
});
