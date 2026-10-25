export function hostKeyStatus(expected:string|undefined,received:string){return expected?(expected===received?'trusted':'changed'):'unknown';}
