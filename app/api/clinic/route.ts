import {getChatGPTUser} from '../../chatgpt-auth';
import {applyAction,visible,appointmentAvailability,DomainError} from '../../../lib/clinic-model';
import {loadVault,persist} from '../../../lib/vault';
import {ZodError,z} from 'zod';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store, private','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
async function authenticated(){const u=await getChatGPTUser();if(!u)throw new DomainError('Для продолжения войдите в аккаунт',401);return loadVault(u.userId,u.email)}
function failure(e:unknown){if(e instanceof DomainError)return json({error:e.message},e.status);if(e instanceof ZodError)return json({error:e.issues[0]?.message||'Проверьте поля формы'},400);return json({error:'Не удалось выполнить запрос. Попробуйте ещё раз.'},500)}
export async function GET(){try{const v=await authenticated();return json(visible(v.state,v.member,v.revision))}catch(e){return failure(e)}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new DomainError('Недопустимый источник запроса',403);
 if(!request.headers.get('content-type')?.includes('application/json'))throw new DomainError('Неверный формат запроса',415);
 if(Number(request.headers.get('content-length'))>32768)throw new DomainError('Слишком большой запрос',413);
 const raw=await request.text();if(raw.length>32768)throw new DomainError('Слишком большой запрос',413);
 let parsed;try{parsed=JSON.parse(raw)}catch{throw new DomainError('Неверный JSON',400)}
 const body=z.object({action:z.string().max(80),revision:z.number().int().min(0),data:z.record(z.unknown())}).parse(parsed);
 const v=await authenticated();
 if(body.action==='appointment.availability')return json({times:appointmentAvailability(v.state,v.member,body.data)});
 if(v.revision!==body.revision)throw new DomainError('Данные изменились. Нажмите «Обновить» и повторите действие.',409);
 if(body.action==='patient.reveal'){
  if(v.member.role!=='admin')throw new DomainError('Паспортные данные доступны только администратору',403);
  const patient=v.state.patients.find(p=>p.id===body.data.id);if(!patient)throw new DomainError('Пациент не найден',404);
  v.state.audit.push({id:crypto.randomUUID(),at:new Date().toISOString(),actor:v.member.id,action:'patient.reveal',target:patient.id});
  const revision=await persist(v.state,v.revision);return json({state:visible(v.state,v.member,revision),passport:patient.passport});
 }
 const target=applyAction(v.state,v.member,body.action,body.data);const revision=await persist(v.state,v.revision);return json({state:visible(v.state,v.member,revision),target});
 }catch(e){return failure(e)}}
