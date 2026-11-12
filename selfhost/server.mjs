import http from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {db,load,persist,seal,verifyPassword,setPassword,digest} from './storage.mjs';
import {initialState,visible,applyAction,appointmentAvailability,DomainError} from '../selfhost-build/clinic-model.mjs';
const origin=process.env.APP_ORIGIN;
if(!origin||new URL(origin).origin!==origin)throw new Error('Set APP_ORIGIN to the exact HTTPS origin without trailing slash.');
const local=process.env.ALLOW_HTTP_LOCAL==='true'&&new URL(origin).hostname==='127.0.0.1';
if(!origin.startsWith('https://')&&!local)throw new Error('HTTPS is required outside loopback development.');
const cookieName=local?'denta_session':'__Host-denta_session';
const publicDir=path.resolve('selfhost-build/public');
if(!load()){
 const email=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
 if(!process.env.ADMIN_PASSWORD_FILE)throw new Error('Set ADMIN_PASSWORD_FILE to bootstrap the first administrator.');
 const password=readFileSync(process.env.ADMIN_PASSWORD_FILE,'utf8').trim();
 const id=await setPassword(email,password);const state=initialState(id,email);
 if(process.env.DEMO_MODE!=='true'){state.patients=[];state.appointments=[];state.plans=[];state.doctors=[];state.services=[]}
 db.prepare('INSERT INTO vault(id,revision,payload) VALUES(1,0,?)').run(seal(state));
}
const secureHeaders={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"};
if(!local)secureHeaders['Strict-Transport-Security']='max-age=31536000; includeSubDomains';
const json=(res,status,body,extra={})=>{res.writeHead(status,{...secureHeaders,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(body))};
const fail=(message,status=400)=>{throw new DomainError(message,status)};
const cookie=(token,maxAge)=>cookieName+'='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+maxAge+(local?'':'; Secure');
function tokenFrom(req){return(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)}
function session(req){const token=tokenFrom(req);if(!token)return null;const now=Date.now();const record=db.prepare('SELECT sessions.*,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=?').get(digest(token));if(!record||record.expires<now||record.last_seen<now-15*60*1000){if(record)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));return null}return record}
function authenticated(req){const s=session(req);if(!s)fail('Сессия завершена. Войдите в аккаунт снова.',401);const v=load();const member=v.state.members.find(m=>m.active&&(m.owner?m.id===s.user_id:m.email===s.email));if(!member)fail('Доступ к клинике не предоставлен',403);db.prepare('UPDATE sessions SET last_seen=? WHERE token_hash=?').run(Date.now(),s.token_hash);return{...v,member}}
async function body(req){if(req.headers.origin!==origin)fail('Недопустимый источник запроса',403);if(!req.headers['content-type']?.startsWith('application/json'))fail('Ожидается JSON',415);let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>32768)fail('Слишком большой запрос',413)}try{return JSON.parse(raw)}catch{fail('Некорректный запрос')}}
let loginInFlight=0;
function limit(key){const now=Date.now();const k=digest(key);db.prepare('DELETE FROM login_limits WHERE reset_at < ?').run(now);const row=db.prepare('SELECT * FROM login_limits WHERE key=?').get(k);if(row&&row.attempts>=8)fail('Слишком много попыток. Повторите через 15 минут.',429);db.prepare('INSERT INTO login_limits(key,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1').run(k,now+15*60*1000)}
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,origin).pathname;
  if(pathname==='/api/login'&&req.method==='POST'){
   const b=await body(req);const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';const password=typeof b.password==='string'?b.password:'';
   if(email.length>200||password.length>256)fail('Неверный email или пароль',401);
   limit('account:'+email);limit('peer:'+req.socket.remoteAddress);
   if(loginInFlight>=2)fail('Повторите попытку через несколько секунд',429);
   loginInFlight++;let ok=false,user;try{user=db.prepare('SELECT * FROM users WHERE email=?').get(email);ok=await verifyPassword(password,user)}finally{loginInFlight--}
   if(!ok)fail('Неверный email или пароль',401);
   const v=load();const m=v.state.members.find(m=>m.active&&(m.owner?m.id===user.id:m.email===email));if(!m)fail('Доступ к клинике не предоставлен',403);
   const token=randomBytes(32).toString('base64url');const now=Date.now();
   db.prepare('DELETE FROM sessions WHERE expires < ? OR last_seen < ?').run(now,now-15*60*1000);
   db.prepare('INSERT INTO sessions(token_hash,user_id,expires,last_seen) VALUES(?,?,?,?)').run(digest(token),user.id,now+8*60*60*1000,now);
   db.prepare('DELETE FROM login_limits WHERE key IN (?,?)').run(digest('account:'+email),digest('peer:'+req.socket.remoteAddress));
   return json(res,200,{ok:true},{'Set-Cookie':cookie(token,8*60*60)});
  }
  if(pathname==='/api/session'&&req.method==='GET'){authenticated(req);return json(res,200,{ok:true})}
  if(pathname==='/signout-with-chatgpt'){const token=tokenFrom(req);if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));res.writeHead(303,{...secureHeaders,Location:'/', 'Set-Cookie':cookie('',0)});return res.end()}
  if(pathname==='/signin-with-chatgpt'){res.writeHead(303,{...secureHeaders,Location:'/'});return res.end()}
  if(pathname==='/api/clinic'){
   if(req.method==='GET'){const v=authenticated(req);return json(res,200,visible(v.state,v.member,v.revision))}
   if(req.method!=='POST')return json(res,405,{error:'Метод не поддерживается'});
   const b=await body(req);const v=authenticated(req);
   if(!b||typeof b.action!=='string'||!Number.isInteger(b.revision)||!b.data||typeof b.data!=='object'||Array.isArray(b.data))fail('Некорректный запрос');
   if(b.action==='appointment.availability')return json(res,200,{times:appointmentAvailability(v.state,v.member,b.data)});
   if(v.revision!==b.revision)fail('Данные изменились. Нажмите «Обновить» и повторите действие.',409);
   if(b.action==='patient.reveal'){if(v.member.role!=='admin')fail('Паспорт доступен только администратору',403);const p=v.state.patients.find(p=>p.id===b.data.id);if(!p)fail('Пациент не найден',404);v.state.audit.push({id:crypto.randomUUID(),at:new Date().toISOString(),actor:v.member.id,action:'patient.reveal',target:p.id});const revision=persist(v.state,v.revision);return json(res,200,{state:visible(v.state,v.member,revision),passport:p.passport})}
   const target=applyAction(v.state,v.member,b.action,b.data);const revision=persist(v.state,v.revision);return json(res,200,{state:visible(v.state,v.member,revision),target});
  }
  if(pathname.startsWith('/api/'))return json(res,404,{error:'Не найдено'});
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Метод не поддерживается'});
  const relative=decodeURIComponent(pathname).replace(/^\/+/,'');let file=path.resolve(publicDir,relative||'index.html');if(!file.startsWith(publicDir+path.sep)&&file!==path.join(publicDir,'index.html'))return json(res,404,{error:'Не найдено'});
  if(!existsSync(file)||!statSync(file).isFile())return json(res,404,{error:'Не найдено'});
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png'};
  res.writeHead(200,{...secureHeaders,'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
  res.end(req.method==='HEAD'?undefined:readFileSync(file));
 }catch(e){if(e instanceof DomainError||e.status)return json(res,e.status||400,{error:e.message});if(e.name==='ZodError')return json(res,400,{error:e.issues?.[0]?.message||'Проверьте поля формы'});console.error('Request failed:',e.name);return json(res,500,{error:'Не удалось выполнить запрос. Попробуйте ещё раз.'})}
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('Denta server listening at '+origin));
