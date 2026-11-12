import { z } from 'zod';
export type Role='admin'|'doctor';
export type Doctor={id:string;name:string;specialty:string;color:string;initials:string};
export type Member={id:string;email:string;role:Role;doctorId:string;active:boolean;owner?:boolean};
export type Patient={id:string;name:string;phone:string;birth:string;address:string;passport:string;notes:string;created:string};
export type Service={id:string;name:string;category:string;description:string;price:number;duration:number;active:boolean};
export type Appointment={id:string;patientId:string;doctorId:string;serviceId:string;serviceName:string;price:number;date:string;time:string;duration:number;status:'scheduled'|'confirmed'|'arrived'|'completed'|'cancelled';paid:boolean;note:string;clinicalNote:string;planId?:string};
export type Plan={id:string;patientId:string;doctorId:string;serviceId:string;title:string;tooth:string;date:string;price:number;note:string;done:boolean};
export type Audit={id:string;at:string;actor:string;action:string;target:string};
export type State={patients:Patient[];services:Service[];appointments:Appointment[];doctors:Doctor[];plans:Plan[];members:Member[];audit:Audit[]};
export type ViewState=State&{revision:number;me:Member};
export class DomainError extends Error{constructor(message:string,public status=400){super(message)}}
export const dateNow=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function shiftDate(date:string,days:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
const uid=()=>crypto.randomUUID();
const text=z.string().trim().max(2000);
const required=z.string().trim().min(1,'Заполните обязательные поля').max(150);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v,'Укажите корректную дату');
const money=z.number().int().min(0).max(100000000);
const patientInput=z.object({name:required,phone:z.string().trim().refine(v=>/^\+?[\d ()-]{7,25}$/.test(v),'Укажите корректный телефон'),birth:z.union([date,z.literal('')]),address:text,passport:z.string().trim().max(300),notes:text});
const serviceInput=z.object({name:required,category:required,description:text,price:money,duration:z.number().int().min(15).max(240).multipleOf(15),active:z.boolean()});
export const appointmentStep = 15;
const openingTime = 9 * 60;
const closingTime = 19 * 60;
const bookingInput = z.object({
 patientId: required,
 doctorId: required,
 date,
 duration: z.number().int().min(appointmentStep).max(240).multipleOf(appointmentStep),
});
const appointmentInput = bookingInput.extend({serviceId:required,time:z.string().regex(/^\d{2}:\d{2}$/),note:text});
type Booking = z.infer<typeof bookingInput>;
export function minutes(t:string){const [h,m]=t.split(':').map(Number);return h*60+m}
export function clockTime(time: number) {
 return String(Math.floor(time / 60)).padStart(2, '0') + ':' + String(time % 60).padStart(2, '0');
}
function ensure(ok:unknown,message:string,status=400):asserts ok{if(!ok)throw new DomainError(message,status)}
function hasPlanBooking(state:State,planId:string){
 return state.appointments.some(appointment=>appointment.planId===planId&&appointment.status!=='cancelled');
}
export function accessible(s:State,m:Member,id:string){return m.role==='admin'||s.appointments.some(a=>a.patientId===id&&a.doctorId===m.doctorId)||s.plans.some(p=>p.patientId===id&&p.doctorId===m.doctorId)}
function editableBooking(state: State, member: Member, booking: Booking, id?: string) {
 const old = id ? state.appointments.find(appointment => appointment.id === id) : undefined;
 if (id) ensure(old, 'Запись не найдена', 404);
 ensure(member.role === 'admin' || (booking.doctorId === member.doctorId && (!old || old.doctorId === member.doctorId)), 'Можно записывать только к своему врачу', 403);
 ensure(accessible(state, member, booking.patientId), 'Нет доступа к пациенту', 403);
 ensure(!old || !['completed', 'cancelled'].includes(old.status), 'Завершённую или отменённую запись нельзя переносить');
 ensure(state.doctors.some(doctor => doctor.id === booking.doctorId), 'Врач не найден');
 ensure(state.patients.some(patient => patient.id === booking.patientId), 'Пациент не найден');
 return old;
}

function bookingConflicts(state: State, booking: Booking, id?: string) {
 const occupied = state.appointments
  .filter(appointment => appointment.id !== id && appointment.status !== 'cancelled'
   && appointment.date === booking.date
   && (appointment.doctorId === booking.doctorId || appointment.patientId === booking.patientId))
  .map(appointment => {
   const start = minutes(appointment.time);
   return { start, end: start + appointment.duration };
  });
 return (start: number) => occupied.some(interval => start < interval.end && start + booking.duration > interval.start);
}

export function appointmentAvailability(state: State, member: Member, input: unknown) {
 const { id, ...booking } = bookingInput.extend({ id: required.optional() }).parse(input);
 editableBooking(state, member, booking, id);
 const conflicts = bookingConflicts(state, booking, id);
 const times: string[] = [];
 for (let start = openingTime; start + booking.duration <= closingTime; start += appointmentStep) {
  if (!conflicts(start)) times.push(clockTime(start));
 }
 return times;
}
export function visible(s:State,m:Member,revision:number):ViewState{
 const patients=s.patients.filter(p=>accessible(s,m,p.id)).map(p=>({...p,passport:'',address:m.role==='admin'?p.address:''}));
 const ids=new Set(patients.map(p=>p.id));
 return {...s,patients,appointments:s.appointments.filter(a=>m.role==='admin'||a.doctorId===m.doctorId),plans:s.plans.filter(p=>ids.has(p.patientId)),members:m.role==='admin'?s.members:[],audit:m.role==='admin'?s.audit.slice(-150).reverse():[],revision,me:m};
}
export function applyAction(s:State,m:Member,action:string,input:unknown):string{
 const body=z.record(z.unknown()).parse(input);const id=typeof body.id==='string'?body.id:'';const admin=()=>ensure(m.role==='admin','Действие доступно только администратору',403);let target=id;
 if(action==='patient.save'){
  const old=s.patients.find(p=>p.id===id);if(id)ensure(old,'Пациент не найден',404);
  if(old){ensure(accessible(s,m,id),'Нет доступа к пациенту',403);admin()}
  const p=patientInput.parse(body);ensure(!p.birth||p.birth<=dateNow(),'Дата рождения не может быть в будущем');if(m.role==='doctor'){p.address='';p.passport=''}
  if(old)Object.assign(old,{...p,passport:body.replacePassport?p.passport:old.passport});else{target=uid();s.patients.push({...p,id:target,created:dateNow()});if(m.role==='doctor')s.plans.push({id:uid(),patientId:target,doctorId:m.doctorId,serviceId:'',title:'Первичный осмотр',tooth:'',date:dateNow(),price:0,note:'',done:false})}
 }else if(action==='service.save'){
  admin();const p=serviceInput.parse(body);const old=s.services.find(x=>x.id===id);if(id)ensure(old,'Услуга не найдена',404);if(old)Object.assign(old,p);else{target=uid();s.services.push({...p,id:target})}
 }else if(action==='appointment.save'){
  const p=appointmentInput.parse(body);
  const old=editableBooking(s,m,p,id);
  const requestedPlanId=required.optional().parse(body.planId);
  ensure(!old||!requestedPlanId||requestedPlanId===old.planId,'Связь записи с этапом изменить нельзя');
  const planId=old?.planId??requestedPlanId;
  const plan=planId?s.plans.find(stage=>stage.id===planId):undefined;
  if(planId){
   ensure(plan,'Этап не найден',404);
   ensure(m.role==='admin'||plan.doctorId===m.doctorId,'Нет доступа к этапу',403);
   ensure(!plan.done,'Этап уже выполнен');
   ensure(p.patientId===plan.patientId&&p.doctorId===plan.doctorId&&p.serviceId===plan.serviceId,'Пациент, врач и услуга должны соответствовать этапу');
   ensure(old||!hasPlanBooking(s,planId),'По этому этапу уже есть запись',409);
  }
  const service=s.services.find(x=>x.id===p.serviceId&&(x.active||old?.serviceId===x.id));
  ensure(service,'Выберите действующую услугу');
  const start=minutes(p.time);
  ensure(start>=openingTime&&start+p.duration<=closingTime&&Number(p.time.slice(3))<60&&start%appointmentStep===0,'Запись возможна с 09:00 до 19:00 с шагом 15 минут');
  ensure(!bookingConflicts(s,p,id)(start),'Это время уже занято у врача или пациента',409);
  if(old){
   Object.assign(old,{...p,...(old.serviceId!==p.serviceId?{serviceName:service.name,price:service.price}:{})});
  }else{
   target=uid();
   s.appointments.push({...p,id:target,planId,serviceName:plan?.title??service.name,price:plan?.price??service.price,status:'scheduled',paid:false,clinicalNote:''});
  }
 }else if(action==='appointment.status'){
  const a=s.appointments.find(x=>x.id===id);ensure(a,'Запись не найдена',404);ensure(m.role==='admin'||a.doctorId===m.doctorId,'Нет доступа к записи',403);const status=z.enum(['confirmed','arrived','completed','cancelled']).parse(body.status);
  const allowed:Record<string,string[]>={scheduled:['confirmed','arrived','completed','cancelled'],confirmed:['arrived','completed','cancelled'],arrived:['completed','cancelled'],completed:[],cancelled:[]};ensure(allowed[a.status].includes(status),'Этот приём уже завершён или отменён');
  if(status==='completed'){
   ensure(a.date<=dateNow(),'Будущий приём пока нельзя завершить');
   a.clinicalNote=z.string().trim().min(5,'Опишите результат приёма (не менее 5 символов)').max(5000).parse(body.clinicalNote);
   const plan=a.planId?s.plans.find(stage=>stage.id===a.planId):undefined;
   if(plan)plan.done=true;
  }
  a.status=status;
 }else if(action==='appointment.pay'){
  admin();const a=s.appointments.find(x=>x.id===id);ensure(a,'Приём не найден',404);ensure(a.status==='completed','Оплата доступна после завершения приёма');ensure(!a.paid,'Приём уже оплачен');a.paid=true;
 }else if(action==='plan.save'){
  const p=z.object({patientId:required,doctorId:required,serviceId:required,tooth:z.string().trim().max(20),date,note:text}).parse(body);
  const old=id?s.plans.find(stage=>stage.id===id):undefined;
  if(id)ensure(old,'Этап не найден',404);
  if(old){
   ensure(m.role==='admin'||old.doctorId===m.doctorId,'Нет доступа к этапу',403);
   ensure(!old.done,'Выполненный этап нельзя изменить');
   ensure(old.patientId===p.patientId,'Пациента этапа изменить нельзя');
   ensure(!hasPlanBooking(s,id),'Для изменения этапа сначала отмените связанную запись',409);
  }
  ensure(accessible(s,m,p.patientId),'Нет доступа к пациенту',403);
  ensure(m.role==='admin'||p.doctorId===m.doctorId,'Нет доступа к плану',403);
  ensure(s.patients.some(patient=>patient.id===p.patientId),'Пациент не найден');
  ensure(s.doctors.some(doctor=>doctor.id===p.doctorId),'Врач не найден');
  const service=s.services.find(entry=>entry.id===p.serviceId&&(entry.active||old?.serviceId===entry.id));
  ensure(service,'Выберите действующую услугу');
  const sameService=old?.serviceId===p.serviceId;
  const snapshot={title:sameService?old.title:service.name,price:sameService?old.price:service.price};
  if(old){
   Object.assign(old,p,snapshot);
  }else{
   target=uid();
   s.plans.push({...p,...snapshot,id:target,done:false});
  }
 }else if(action==='plan.complete'){
  const p=s.plans.find(x=>x.id===id);ensure(p,'Этап не найден',404);ensure(m.role==='admin'||p.doctorId===m.doctorId,'Нет доступа к этапу',403);
  ensure(!p.done,'Этап уже выполнен');
  ensure(!hasPlanBooking(s,id),'Завершите приём, связанный с этим этапом');
  p.done=true;
 }else if(action==='member.save'){
  admin();const p=z.object({email:z.string().email().transform(v=>v.toLowerCase().trim()),role:z.enum(['admin','doctor']),doctorId:z.string(),active:z.boolean()}).parse(body);ensure(p.role!=='doctor'||s.doctors.some(x=>x.id===p.doctorId),'Выберите врача');const old=s.members.find(x=>x.email===p.email);ensure(!old?.owner,'Роль владельца изменить нельзя');
  if(p.role==='doctor')ensure(!s.members.some(x=>x.active&&x.doctorId===p.doctorId&&x.email!==p.email),'Этот врач уже связан с другим сотрудником');
  if(old)Object.assign(old,p);else{target=uid();s.members.push({...p,id:target})}
 }else if(action==='doctor.save'){
  admin();const p=z.object({name:required,specialty:required}).parse(body);const old=s.doctors.find(x=>x.id===id);if(id)ensure(old,'Врач не найден',404);if(old)Object.assign(old,p);else{target=uid();s.doctors.push({...p,id:target,initials:p.name.split(' ').slice(0,2).map(v=>v[0]).join(''),color:['mint','lavender','peach','blue'][s.doctors.length%4]})}
 }else throw new DomainError('Неизвестное действие');
 s.audit.push({id:uid(),at:new Date().toISOString(),actor:m.id,action,target});return target;
}
export function initialState(ownerId:string,email:string):State{
 const today=dateNow();
 const doctors:Doctor[]=[{id:'d1',name:'Анна Смирнова',specialty:'Терапевт',color:'mint',initials:'АС'},{id:'d2',name:'Михаил Волков',specialty:'Хирург · имплантолог',color:'lavender',initials:'МВ'},{id:'d3',name:'Елена Морозова',specialty:'Ортодонт',color:'peach',initials:'ЕМ'}];
 const services:Service[]=[['s1','Консультация стоматолога','Диагностика','Осмотр и обсуждение плана лечения',1500,30],['s2','Лечение кариеса','Терапия','Лечение кариеса с восстановлением композитом',6500,60],['s3','Профессиональная гигиена','Профилактика','Ультразвуковая чистка, Air Flow и полировка',5500,60],['s4','Консультация ортодонта','Ортодонтия','Оценка прикуса и обсуждение коррекции',2500,45],['s5','Удаление зуба','Хирургия','Простое удаление постоянного зуба',4500,60],['s6','Установка имплантата','Имплантация','Хирургический этап установки имплантата',45000,90],['s7','Коррекция брекет-системы','Ортодонтия','Плановая активация и контроль лечения',3500,45],['s8','КТ челюсти','Диагностика','Трёхмерная диагностика зубочелюстной системы',3000,30]].map(([id,name,category,description,price,duration])=>({id:String(id),name:String(name),category:String(category),description:String(description),price:Number(price),duration:Number(duration),active:true}));
 const names=['Александра Белова','Дмитрий Ковалёв','Мария Соколова','Артём Лебедев','Ольга Новикова','Иван Петров','Екатерина Орлова','Сергей Кузнецов','Анастасия Власова','Павел Фомин'];
 const patients=names.map((name,i)=>({id:'p'+i,name,phone:'+7 (000) 000-00-'+String(i).padStart(2,'0'),birth:(1988+i)+'-05-15',address:'Демонстрационный адрес',passport:'ТЕСТ — недействительные данные',notes:i===0?'Демонстрационная карточка. Предпочитает утренние приёмы.':'Демонстрационная карточка пациента.',created:shiftDate(today,-70-i)}));
 const slots=[['p0','d1','s2','09:00','completed'],['p1','d2','s1','09:30','completed'],['p2','d3','s4','09:00','completed'],['p3','d1','s3','10:30','confirmed'],['p4','d2','s6','11:00','confirmed'],['p5','d3','s7','10:30','scheduled'],['p6','d1','s1','12:00','arrived'],['p7','d3','s4','12:00','confirmed'],['p8','d1','s2','14:00','scheduled'],['p9','d2','s5','14:30','scheduled'],['p0','d3','s4','15:30','confirmed'],['p2','d1','s3','16:00','scheduled']];
 const appointments:Appointment[]=slots.map(([patientId,doctorId,serviceId,time,status],i)=>{const service=services.find(s=>s.id===serviceId)!;return{id:'a'+i,patientId,doctorId,serviceId,serviceName:service.name,price:service.price,date:today,time,duration:service.duration,status:status as Appointment['status'],paid:status==='completed',note:'',clinicalNote:status==='completed'?'Демонстрационный приём. Осмотр выполнен, дальнейшие шаги обсуждены.':''}});
 for(let i=0;i<8;i++){const service=services[i%services.length];appointments.push({id:'h'+i,patientId:'p'+i,doctorId:doctors[i%3].id,serviceId:service.id,serviceName:service.name,price:service.price,date:shiftDate(today,-7-i*3),time:'10:00',duration:service.duration,status:'completed',paid:i!==3,note:'',clinicalNote:'Демонстрационная запись: лечение проведено, рекомендации внесены в план.'})}
 const plans:Plan[]=[{id:'pl1',patientId:'p0',doctorId:'d1',serviceId:'s2',title:'Лечение кариеса',tooth:'26',date:today,price:6500,note:'Демонстрационный этап лечения',done:true},{id:'pl2',patientId:'p0',doctorId:'d1',serviceId:'s3',title:'Профессиональная гигиена',tooth:'',date:shiftDate(today,7),price:5500,note:'Следующий этап согласовать с пациентом',done:false},{id:'pl3',patientId:'p2',doctorId:'d3',serviceId:'s7',title:'Коррекция брекет-системы',tooth:'',date:shiftDate(today,14),price:3500,note:'Плановый контроль',done:false}];
 return{doctors,services,patients,appointments,plans,members:[{id:ownerId,email,role:'admin',doctorId:'',active:true,owner:true}],audit:[]};
}
