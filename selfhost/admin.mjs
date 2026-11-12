import {readFileSync} from 'node:fs';
import {db,load,setPassword,snapshot} from './storage.mjs';
const [command,value]=process.argv.slice(2);
if(command==='set-password'){
 const email=String(value||'').trim().toLowerCase();const v=load();if(!v?.state.members.some(m=>m.email===email&&m.active))throw new Error('First add an active member with this email in the clinic UI.');
 let password='';for await(const chunk of process.stdin)password+=chunk;
 await setPassword(email,password.trim());console.log('Password updated; existing sessions revoked.');
}else if(command==='backup'){
 if(!value)throw new Error('Pass an absolute destination path inside a protected backup directory.');
 await snapshot(value);console.log('Encrypted database snapshot created. Keep the encryption key separately.');
}else throw new Error('Use: set-password EMAIL < secret-file; or: backup ABSOLUTE_PATH');
db.close();
