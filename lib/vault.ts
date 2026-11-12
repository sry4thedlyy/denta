import { env } from 'cloudflare:workers';
import { DomainError,initialState,type State,type Member } from './clinic-model';
type Row={owner_id:string;revision:number;payload:string};
function db(){if(!env.DB)throw new DomainError('Хранилище ещё не настроено',503);return env.DB}
async function key(){if(!env.CLINIC_DATA_KEY)throw new DomainError('Ключ шифрования не настроен',503);const bytes=Uint8Array.from(atob(env.CLINIC_DATA_KEY),c=>c.charCodeAt(0));return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt'])}
const aad=new TextEncoder().encode('denta-clinic:v1:main');
export async function seal(state:State){const iv=crypto.getRandomValues(new Uint8Array(12));const data=new TextEncoder().encode(JSON.stringify(state));if(data.length>1800000)throw new DomainError('Достигнут лимит тестовой версии. Нужен переход на рабочее хранилище.',413);const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await key(),data);return JSON.stringify({v:1,iv:Array.from(iv),data:Array.from(new Uint8Array(cipher))})}
export async function unseal(payload:string):Promise<State>{const p=JSON.parse(payload);if(p.v!==1)throw new Error('Unsupported vault');const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(p.iv),additionalData:aad},await key(),new Uint8Array(p.data));return JSON.parse(new TextDecoder().decode(data))}
export async function loadVault(userId:string,email:string){
 let row=await db().prepare('SELECT owner_id,revision,payload FROM clinic_vault WHERE id = ?').bind('main').first<Row>();
 if(!row){const initial=initialState(userId,email.toLowerCase());await db().prepare('INSERT OR IGNORE INTO clinic_vault (id,owner_id,revision,payload) VALUES (?,?,?,?)').bind('main',userId,0,await seal(initial)).run();row=await db().prepare('SELECT owner_id,revision,payload FROM clinic_vault WHERE id = ?').bind('main').first<Row>()}
 if(!row)throw new DomainError('Не удалось открыть хранилище',503);
 const state=await unseal(row.payload);
 const member=state.members.find(m=>m.active&&(m.owner?row!.owner_id===userId:m.email===email.toLowerCase()));
 if(!member)throw new DomainError('Доступ не предоставлен. Обратитесь к администратору клиники.',403);
 return {state,member,revision:row.revision};
}
export async function persist(state:State,revision:number){
 const result=await db().prepare('UPDATE clinic_vault SET payload = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(await seal(state),'main',revision).run();
 if(result.meta.changes!==1)throw new DomainError('Данные изменены другим сотрудником. Обновите страницу и повторите действие.',409);
 return revision+1;
}
