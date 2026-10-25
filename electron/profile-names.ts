/** Rename only the display title; preserve connection identity and secrets. */
export function renameProfile<T extends {id:string;name:string}>(profiles:T[],id:string,name:string):T[]{
 if(typeof name!=='string'||!name.trim()||name.trim().length>64||/[\x00-\x1f\x7f]/.test(name))throw new Error('Enter a display name between 1 and 64 characters.');
 if(!profiles.some(p=>p.id===id))throw new Error('Saved host no longer exists.');
 return profiles.map(p=>p.id===id?{...p,name:name.trim()}:p);
}
