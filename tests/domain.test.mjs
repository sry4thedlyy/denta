import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,applyAction,visible,dateNow,shiftDate,DomainError} from '../selfhost-build/clinic-model.mjs';
const fresh=()=>{const s=initialState('owner','owner@example.test');return{s,m:s.members[0]}};
test('Overlaps for both doctor and patient rejected; adjacent intervals accepted',()=>{
 const {s,m}=fresh();const input={patientId:'p0',doctorId:'d1',serviceId:'s1',date:dateNow(),time:'09:30',duration:30,note:''};
 assert.throws(()=>applyAction(s,m,'appointment.save',input),/занято/);
 assert.throws(()=>applyAction(s,m,'appointment.save',{...input,doctorId:'d2',time:'09:00'}),/занято/);
 const id=applyAction(s,m,'appointment.save',{...input,time:'10:00'});assert.ok(s.appointments.find(a=>a.id===id));
 assert.throws(()=>applyAction(s,m,'appointment.save',{...input,time:'18:45',duration:30}),/09:00/);
});
test('Historical price is preserved across catalogue edits and rescheduling',()=>{
 const {s,m}=fresh();const service=s.services[0];const oldPrice=service.price;
 const id=applyAction(s,m,'appointment.save',{patientId:'p0',doctorId:'d1',serviceId:service.id,date:dateNow(),time:'13:00',duration:30,note:''});
 applyAction(s,m,'service.save',{...service,price:99999});
 const a=s.appointments.find(a=>a.id===id);applyAction(s,m,'appointment.save',{...a,time:'13:30'});
 assert.equal(a.price,oldPrice);
 applyAction(s,m,'appointment.status',{id,status:'completed',clinicalNote:'Тестовый результат приёма'});
 applyAction(s,m,'appointment.pay',{id});assert.equal(a.paid,true);assert.equal(a.price,oldPrice);
 assert.throws(()=>applyAction(s,m,'appointment.pay',{id}),/уже оплачен/);
 assert.throws(()=>applyAction(s,m,'appointment.save',{...a,time:'17:00'}),/Завершённую/);
});
test('Doctor role cannot reveal passport/address, edit services, access others or self-promote',()=>{
 const {s}=fresh();const m={id:'doctor',email:'doctor@example.test',role:'doctor',doctorId:'d1',active:true};
 const v=visible(s,m,0);assert.ok(v.patients.length>0);assert.ok(v.patients.every(p=>!p.passport&&!p.address));assert.equal(v.members.length,0);assert.equal(v.audit.length,0);assert.ok(v.appointments.every(a=>a.doctorId==='d1'));
 assert.throws(()=>applyAction(s,m,'service.save',s.services[0]),/администратору/);
 assert.throws(()=>applyAction(s,m,'member.save',{email:m.email,role:'admin',doctorId:'',active:true}),/администратору/);
 assert.throws(()=>applyAction(s,m,'appointment.status',{id:'a4',status:'arrived'}),/Нет доступа/);
 assert.throws(()=>applyAction(s,m,'appointment.save',{patientId:'p9',doctorId:'d1',serviceId:'s1',date:dateNow(),time:'13:00',duration:30,note:''}),/Нет доступа/);
});
test('Validation protects invalid dates, future completion, role owner and notes',()=>{
 const {s,m}=fresh();
 assert.throws(()=>applyAction(s,m,'patient.save',{name:'Тест',phone:'bad',birth:'',address:'',passport:'',notes:''}));
 const id=applyAction(s,m,'appointment.save',{patientId:'p0',doctorId:'d1',serviceId:'s1',date:shiftDate(dateNow(),1),time:'13:00',duration:30,note:''});
 assert.throws(()=>applyAction(s,m,'appointment.status',{id,status:'completed',clinicalNote:'Тестовые данные'}),/Будущий/);
 assert.throws(()=>applyAction(s,m,'member.save',{email:m.email,role:'doctor',doctorId:'d1',active:false}),/владельца/);
 assert.throws(()=>applyAction(s,m,'appointment.status',{id:'a3',status:'completed',clinicalNote:''}));
});

test('A treatment stage preserves its quoted price through booking, cancellation and completion',()=>{
 const {s,m}=fresh();
 const original=s.plans.find(plan=>plan.id==='pl2');
 const base={id:original.id,patientId:original.patientId,doctorId:original.doctorId,serviceId:original.serviceId,date:dateNow(),tooth:'26',note:'Уточнён этап лечения'};
 const catalogue=s.services.find(service=>service.id===base.serviceId);
 const quotedPrice=original.price;
 applyAction(s,m,'service.save',{...catalogue,price:quotedPrice+1000});
 applyAction(s,m,'plan.save',base);
 assert.equal(original.price,quotedPrice);
 assert.equal(original.tooth,'26');
 const appointment={...base,id:undefined,planId:base.id,time:'13:00',duration:60};
 const id=applyAction(s,m,'appointment.save',appointment);
 assert.equal(s.appointments.find(visit=>visit.id===id).price,quotedPrice);
 assert.throws(()=>applyAction(s,m,'appointment.save',{...appointment,time:'17:00'}),/уже есть запись/);
 assert.throws(()=>applyAction(s,m,'plan.save',base),/отмените связанную запись/);
 assert.throws(()=>applyAction(s,m,'appointment.save',{...appointment,id,doctorId:'d2'}),/соответствовать этапу/);
 applyAction(s,m,'appointment.status',{id,status:'cancelled'});
 assert.equal(original.done,false);
 const replacement=applyAction(s,m,'appointment.save',{...appointment,time:'17:00'});
 applyAction(s,m,'appointment.status',{id:replacement,status:'completed',clinicalNote:'Тестовый результат приёма'});
 assert.equal(original.done,true);
 assert.throws(()=>applyAction(s,m,'plan.save',base),/Выполненный этап/);
});
test('A doctor cannot take ownership of another doctor’s treatment stage',()=>{
 const {s}=fresh();
 const doctor={id:'doctor',email:'doctor@example.test',role:'doctor',doctorId:'d1',active:true};
 const stage=s.plans.find(plan=>plan.id==='pl3');
 assert.throws(()=>applyAction(s,doctor,'plan.save',{...stage,doctorId:'d1'}),e=>e.status===403);
 assert.throws(()=>applyAction(s,doctor,'appointment.save',{...stage,id:undefined,planId:stage.id,doctorId:'d1',time:'17:00',duration:45}),e=>e.status===403);
});
