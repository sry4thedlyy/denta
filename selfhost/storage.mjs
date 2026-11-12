import {DatabaseSync,backup} from 'node:sqlite';
import {createCipheriv,createDecipheriv,randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {readFileSync,mkdirSync,chmodSync} from 'node:fs';
import path from 'node:path';
export const dataDir=path.resolve(process.env.DATA_DIR||'./work/selfhost-data');
mkdirSync(dataDir,{recursive:true,mode:0o700});
const keyFile=process.env.CLINIC_DATA_KEY_FILE;
if(!keyFile)throw new Error('Set CLINIC_DATA_KEY_FILE to a mounted secret file.');
const key=Buffer.from(readFileSync(keyFile,'utf8').trim(),'base64');
if(key.length!==32)throw new Error('CLINIC_DATA_KEY_FILE must contain a base64-encoded 32-byte key.');
export const db=new DatabaseSync(path.join(dataDir,'clinic.sqlite'));
try{chmodSync(path.join(dataDir,'clinic.sqlite'),0o600)}catch{}
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
db.exec('CREATE TABLE IF NOT EXISTS vault(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL,last_seen INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS login_limits(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,reset_at INTEGER NOT NULL);');
const aad=Buffer.from('denta-clinic:selfhost:v1');
export function seal(value){const iv=randomBytes(12);const c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(aad);const plain=JSON.stringify(value);if(Buffer.byteLength(plain)>1800000)throw Object.assign(new Error('Достигнут лимит пилотной версии. Нужна миграция хранилища.'),{status:413});const body=Buffer.concat([c.update(plain,'utf8'),c.final()]);return JSON.stringify({v:1,iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:body.toString('base64')})}
export function unseal(payload){const p=JSON.parse(payload);if(p.v!==1)throw new Error('Unsupported vault');const d=createDecipheriv('aes-256-gcm',key,Buffer.from(p.iv,'base64'));d.setAAD(aad);d.setAuthTag(Buffer.from(p.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(p.data,'base64')),d.final()]).toString('utf8'))}
export function load(){const row=db.prepare('SELECT * FROM vault WHERE id=1').get();if(!row)return null;return{state:unseal(row.payload),revision:Number(row.revision)}}
export function persist(state,revision){const r=db.prepare('UPDATE vault SET payload=?,revision=revision+1 WHERE id=1 AND revision=?').run(seal(state),revision);if(r.changes!==1)throw Object.assign(new Error('Данные изменены другим сотрудником. Обновите страницу.'),{status:409});return revision+1}
export const digest=v=>createHash('sha256').update(v).digest('hex');
const scrypt=promisify(scryptCallback);
const settings={N:131072,r:8,p:1,maxmem:160*1024*1024};
export async function hashPassword(password,salt){return Buffer.from(await scrypt(password,salt,64,settings)).toString('hex')}
export async function verifyPassword(password,user){const salt=user?.salt||'00000000000000000000000000000000';const actual=Buffer.from(await hashPassword(password,salt),'hex');const expected=Buffer.from(user?.password_hash||'00'.repeat(64),'hex');return timingSafeEqual(actual,expected)&&!!user}
export async function setPassword(email,password){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200)throw new Error('Invalid email');if(password.length<14||password.length>256)throw new Error('Password must contain 14 to 256 characters');const old=db.prepare('SELECT id FROM users WHERE email=?').get(email);const id=old?.id||crypto.randomUUID();const salt=randomBytes(16).toString('hex'),hash=await hashPassword(password,salt);db.prepare('INSERT INTO users(id,email,salt,password_hash) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET salt=excluded.salt,password_hash=excluded.password_hash').run(id,email,salt,hash);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);return id}
export async function snapshot(destination){await backup(db,destination)}
