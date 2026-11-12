import {mkdir,writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
const dir=path.resolve('selfhost/secrets');
await mkdir(dir,{recursive:true,mode:0o700});
for(const name of ['clinic_data_key','admin_password']){try{await access(path.join(dir,name));throw new Error(name+' already exists. Existing secrets must never be overwritten.')}catch(e){if(e.code!=='ENOENT')throw e}}
await writeFile(path.join(dir,'clinic_data_key'),randomBytes(32).toString('base64')+'\n',{mode:0o600,flag:'wx'});
await writeFile(path.join(dir,'admin_password'),randomBytes(24).toString('base64url')+'\n',{mode:0o600,flag:'wx'});
console.log('Secret files created in selfhost/secrets. Read admin_password locally to obtain the initial password. No secrets were printed.');
