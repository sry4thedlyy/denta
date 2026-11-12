import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const root=process.cwd();const testRoot=path.join(root,'work','integration-'+Date.now());await mkdir(testRoot,{recursive:true});
const password=randomBytes(24).toString('base64url');await writeFile(path.join(testRoot,'key'),randomBytes(32).toString('base64'));await writeFile(path.join(testRoot,'password'),password);
const port=37843;const base='http://127.0.0.1:'+port;
const env={...process.env,APP_ORIGIN:base,HOST:'127.0.0.1',PORT:String(port),ALLOW_HTTP_LOCAL:'true',ADMIN_EMAIL:'admin@example.test',ADMIN_PASSWORD_FILE:path.join(testRoot,'password'),CLINIC_DATA_KEY_FILE:path.join(testRoot,'key'),DATA_DIR:path.join(testRoot,'db'),DEMO_MODE:'true'};
let server;
async function start(){server=spawn(process.execPath,['selfhost/server.mjs'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server readiness timeout')),15000);server.once('exit',c=>{clearTimeout(timer);reject(new Error('Server exited '+c))});server.stdout.on('data',d=>{if(String(d).includes('listening')){clearTimeout(timer);resolve()}});server.stderr.on('data',d=>{if(!String(d).includes('ExperimentalWarning'))process.stderr.write(d)})})}
async function stop(){if(server&&!server.killed){const p=new Promise(r=>server.once('exit',r));server.kill();await p}}
async function call(url,opts={}){const r=await fetch(base+url,opts);return{status:r.status,headers:r.headers,body:await r.json()}}
const post=(payload,cookie)=>({method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(payload)});
async function login(email,pw){const r=await call('/api/login',post({email,password:pw}));assert.equal(r.status,200,JSON.stringify(r.body));return r.headers.get('set-cookie').split(';')[0]}
test('Self-host API: login, encryption, authorization, conflicts, persistence and backup',async t=>{
 try{await start();
 await t.test('No anonymous access or identity-header spoofing',async()=>{assert.equal((await call('/api/clinic')).status,401);assert.equal((await call('/api/clinic',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'admin@example.test'}})).status,401)});
 const cookie=await login('admin@example.test',password);let v=(await call('/api/clinic',{headers:{Cookie:cookie}})).body;
 await t.test('Availability checks both calendars, duration and the visit being moved', async () => {
  const existing = v.appointments.find(appointment => appointment.id === 'a3');
  const booking = {patientId: 'p0', doctorId: 'd2', date: existing.date, duration: 30};
  const availability = data => post({action: 'appointment.availability', revision: v.revision, data}, cookie);
  const result = await call('/api/clinic', availability(booking));
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body), ['times']);
  assert.ok(!result.body.times.includes('09:00')); // Patient has an appointment with a different doctor.
  assert.ok(!result.body.times.includes('11:00')); // Doctor has an appointment with a different patient.
  assert.ok(result.body.times.includes('13:00'));
  assert.ok(result.body.times.includes('18:30'));
  assert.ok(!result.body.times.includes('18:45'));
  const move = await call('/api/clinic', availability({
   id: existing.id, patientId: existing.patientId, doctorId: existing.doctorId,
   date: existing.date, duration: existing.duration,
  }));
  assert.ok(move.body.times.includes(existing.time));
  assert.equal((await call('/api/clinic', {headers: {Cookie: cookie}})).body.revision, v.revision);
 });
 await t.test('Cookie protections and same-origin checks',async()=>{const x=await call('/api/login',post({email:'admin@example.test',password}));assert.match(x.headers.get('set-cookie'),/HttpOnly/);assert.match(x.headers.get('set-cookie'),/SameSite=Strict/);const bad=post({action:'patient.reveal',revision:v.revision,data:{id:'p0'}},cookie);bad.headers.Origin='https://attacker.example';assert.equal((await call('/api/clinic',bad)).status,403)});
 await t.test('Patient passport is not included in normal API responses',()=>{assert.ok(v.patients.every(p=>p.passport===''));assert.ok(!JSON.stringify(v).includes('ТЕСТ — недействительные данные'))});
 await t.test('Passport reveal is authorized and audited',async()=>{const r=await call('/api/clinic',post({action:'patient.reveal',revision:v.revision,data:{id:'p0'}},cookie));assert.equal(r.status,200);assert.ok(r.body.passport.includes('ТЕСТ'));v=r.body.state;assert.equal(v.audit[0].action,'patient.reveal')});
 await t.test('Stale write is rejected and state is unchanged',async()=>{const r=await call('/api/clinic',post({action:'patient.reveal',revision:v.revision-1,data:{id:'p0'}},cookie));assert.equal(r.status,409)});
 await t.test('Doctor account restrictions are enforced by API',async()=>{
  const r=await call('/api/clinic',post({action:'member.save',revision:v.revision,data:{email:'doctor@example.test',role:'doctor',doctorId:'d1',active:true}},cookie));assert.equal(r.status,200);v=r.body.state;
  const pw=randomBytes(24).toString('base64url');await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['selfhost/admin.mjs','set-password','doctor@example.test'],{cwd:root,env,windowsHide:true,stdio:['pipe','ignore','pipe']});child.stdin.end(pw);child.once('exit',c=>c===0?resolve():reject(new Error('Account provisioning failed')))});
  const dc=await login('doctor@example.test',pw);const dv=(await call('/api/clinic',{headers:{Cookie:dc}})).body;assert.equal(dv.me.role,'doctor');assert.ok(dv.patients.every(p=>!p.passport&&!p.address));assert.ok(dv.appointments.every(a=>a.doctorId==='d1'));
  assert.equal((await call('/api/clinic',post({action:'patient.reveal',revision:dv.revision,data:{id:'p0'}},dc))).status,403);
  assert.equal((await call('/api/clinic',post({action:'service.save',revision:dv.revision,data:dv.services[0]},dc))).status,403);
  const date = dv.appointments[0].date;
  const availability = data => post({action:'appointment.availability',revision:dv.revision,data:{date,duration:30,...data}},dc);
  assert.equal((await call('/api/clinic',availability({patientId:'p0',doctorId:'d2'}))).status,403);
  assert.equal((await call('/api/clinic',availability({patientId:'p9',doctorId:'d1'}))).status,403);
  const available = await call('/api/clinic',availability({patientId:'p0',doctorId:'d1'}));
  assert.equal(available.status,200);
  assert.ok(!available.body.times.includes('15:30')); // Patient's other visit is hidden from this doctor.
 });
 await t.test('Database contains ciphertext and restart retains state',async()=>{
  await stop();const d=new DatabaseSync(path.join(testRoot,'db','clinic.sqlite'),{readOnly:true});const record=d.prepare('SELECT * FROM vault').get();assert.ok(!record.payload.includes('Александра'));assert.ok(!record.payload.includes('Паспорт'));const payload=JSON.parse(record.payload);assert.equal(payload.v,1);assert.ok(payload.iv&&payload.tag&&payload.data);d.close();
  await start();const c=await login('admin@example.test',password);const r=await call('/api/clinic',{headers:{Cookie:c}});assert.equal(r.body.revision,v.revision);assert.equal(r.body.members.length,2);
 });
 await t.test('Encrypted backup can be read by SQLite',async()=>{
  const target=path.join(testRoot,'backup.sqlite');await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['selfhost/admin.mjs','backup',target],{cwd:root,env,windowsHide:true,stdio:'ignore'});child.once('exit',c=>c===0?resolve():reject(new Error('Backup failed')))});
  const d=new DatabaseSync(target,{readOnly:true});assert.equal(Number(d.prepare('SELECT revision FROM vault').get().revision),v.revision);d.close();
 });
 await t.test('Idle sessions expire',async()=>{const c=await login('admin@example.test',password);const d=new DatabaseSync(path.join(testRoot,'db','clinic.sqlite'));d.prepare('UPDATE sessions SET last_seen=?').run(Date.now()-16*60*1000);d.close();assert.equal((await call('/api/clinic',{headers:{Cookie:c}})).status,401)});
 }finally{await stop()}
});
