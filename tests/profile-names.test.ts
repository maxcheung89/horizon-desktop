import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renameProfile} from '../electron/profile-names';
test('renaming preserves host identity, credentials, trust and other profiles',()=>{
 const original=[{id:'a',name:'Old',host:'example.test',secret:'encrypted fixture',fingerprint:'trusted fixture',port:22},{id:'b',name:'Other',host:'other.test',secret:'',fingerprint:'',port:2222}];
 const result=renameProfile(original,'a','  Studio Server  ');assert.deepEqual(result[0],{...original[0],name:'Studio Server'});assert.equal(result[1],original[1]);assert.equal(original[0].name,'Old');
 for(const name of ['', '   ', 'x'.repeat(65),'bad\nname'])assert.throws(()=>renameProfile(original,'a',name));assert.throws(()=>renameProfile(original,'missing','Name'));
});
