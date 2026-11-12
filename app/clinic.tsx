'use client';
import {useState,useEffect,useRef,type ReactNode,type FormEvent} from 'react';
import {CalendarDays,Users,ClipboardList,Layers,Settings,ShieldCheck,Plus,Search,ChevronLeft,ChevronRight,ChevronDown,ArrowUpRight,Clock,Check,CheckCheck,X,MoreHorizontal,ArrowLeft,Phone,MapPin,LockKeyhole,Eye,FileText,Stethoscope,LayoutGrid,List,RefreshCw,LogOut,Menu,CheckCircle2,Wallet,AlertCircle,ArrowRight,Mail,Activity, Pencil} from 'lucide-react';
import {dateNow,shiftDate,minutes,clockTime,appointmentStep,type ViewState,type Appointment,type Patient,type Service,type Doctor,type Plan} from '../lib/clinic-model';
const rub=(v:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(v);
const pretty=(v:string,options:Intl.DateTimeFormatOptions={day:'numeric',month:'long'})=>v?new Date(v+'T12:00:00').toLocaleDateString('ru-RU',options):'Не указано';
const endTime=(a:Appointment)=>clockTime(minutes(a.time)+a.duration);
const statuses:Record<Appointment['status'],string>={scheduled:'Ожидает подтверждения',confirmed:'Подтверждён',arrived:'В клинике',completed:'Завершён',cancelled:'Отменён'};
const plural=(n:number,forms:string[])=>n+' '+forms[(n%100>=11&&n%100<=14)?2:n%10===1?0:n%10>=2&&n%10<=4?1:2];
const initials=(name:string)=>name.split(' ').slice(0,2).map(s=>s[0]).join('');
type Section='schedule'|'patients'|'records'|'services'|'team';
type Modal={kind:string;item?:any;patientId?:string;doctorId?:string;time?:string;plan?:Plan};
const nav:[Section,typeof CalendarDays,string][]=[['schedule',CalendarDays,'Расписание'],['patients',Users,'Пациенты'],['records',ClipboardList,'История приёмов'],['services',Layers,'Услуги и цены'],['team',Stethoscope,'Врачи и сотрудники']];
function Badge({status}:{status:Appointment['status']}){return <span className={'badge '+status}><i/>{statuses[status]}</span>}
function Empty({title,children}:{title:string;children?:ReactNode}){return <div className="empty"><CalendarDays size={32}/><h3>{title}</h3><p>{children}</p></div>}
function Field({label,children,wide=false}:{label:string;children:ReactNode;wide?:boolean}){return <label className={'field '+(wide?'wide':'')}><span>{label}</span>{children}</label>}
function Dialog({title,subtitle,children,onClose}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const prev=document.activeElement as HTMLElement;const focus=()=>{const el=ref.current?.querySelector<HTMLElement>('input,select,textarea,button');el?.focus()};focus();const handler=(e:KeyboardEvent)=>{if(e.key==='Escape'){onClose();return}if(e.key==='Tab'){const els=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')||[]).filter(x=>x.offsetParent!==null);if(!els.length)return;const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};document.addEventListener('keydown',handler);const before=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.removeEventListener('keydown',handler);document.body.style.overflow=before;prev?.focus()}},[]);
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={ref}><header><div><h2 id="dialog-title">{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={20}/></button></header>{children}</div></div>
}
export default function Clinic({deployment='sites'}:{deployment?:'sites'|'selfhost'}){
 const [data,setData]=useState<ViewState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[section,setSection]=useState<Section>('schedule'),[selectedDate,setDate]=useState(dateNow),[query,setQuery]=useState(''),[doctor,setDoctor]=useState('all'),[view,setView]=useState('day'),[statusFilter,setStatusFilter]=useState('all'),[category,setCategory]=useState('Все услуги'),[patientId,setPatientId]=useState<string|null>(null),[patientTab,setPatientTab]=useState('overview'),[modal,setModal]=useState<Modal|null>(null),[modalError,setModalError]=useState(''),[toast,setToast]=useState(''),[menu,setMenu]=useState(false),[teamTab,setTeamTab]=useState('doctors'),[from,setFrom]=useState(''),[until,setUntil]=useState(''),[passport,setPassport]=useState<string|null>(null);
 async function refresh(){try{setError('');const r=await fetch('/api/clinic',{cache:'no-store'});const v=await r.json() as ViewState & {error?:string};if(!r.ok)throw new Error(v.error);setData(v)}catch(e){setError((e as Error).message)}}
 useEffect(()=>{refresh()},[]);
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>{setData(null);setPassport(null);window.location.assign('/signout-with-chatgpt?return_to=/')},15*60*1000)};const events=['pointerdown','keydown','wheel'];events.forEach(name=>window.addEventListener(name,reset,{passive:true}));reset();return()=>{clearTimeout(timer);events.forEach(name=>window.removeEventListener(name,reset))}},[]);
 useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(timer)}},[toast]);
 useEffect(()=>{setPassport(null)},[patientId,patientTab]);
 useEffect(()=>{if(passport!==null){const t=setTimeout(()=>setPassport(null),30000);return()=>clearTimeout(t)}},[passport]);
 useEffect(()=>{const hide=()=>{if(document.hidden)setPassport(null)};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide)},[]);
 function open(m:Modal){setModalError('');setModal(m)}
 function go(s:Section){setSection(s);setDoctor('all');setQuery('');setPatientId(null);setStatusFilter('all');setMenu(false)}
 async function mutate(action:string,payload:any,close=true){
  if(!data||busy)return null;setBusy(true);setModalError('');
  try{const r=await fetch('/api/clinic',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data:payload,revision:data.revision})});const result=await r.json() as {state:ViewState;error?:string;passport?:string;target?:string};if(!r.ok)throw new Error(result.error);setData(result.state);if(close)setModal(null);setToast(action==='patient.reveal'?'Просмотр записан в журнал доступа':'Изменения сохранены');return result}
  catch(e){setModalError((e as Error).message);if(!modal)setToast((e as Error).message);return null}finally{setBusy(false)}
 }
 function selectPatient(id:string){setPatientId(id);setPatientTab('overview');setSection('patients');setModal(null)}
 if(!data)return <div className="startup"><div className="brand-mark"><Tooth/></div><h1>Дента</h1>{error?<><p className="form-error">{error}</p><button className="primary" onClick={refresh}><RefreshCw size={16}/>Повторить</button><a href="/signin-with-chatgpt?return_to=/" target="_top">Войти в аккаунт</a></>:<p>Открываем рабочее пространство…</p>}</div>;
 const admin=data.me.role==='admin';
 const pName=(id:string)=>data.patients.find(p=>p.id===id)?.name||'Пациент';
 const dName=(id:string)=>data.doctors.find(d=>d.id===id)?.name||'Врач';
 const activeDoctors=data.doctors.filter(d=>(admin||d.id===data.me.doctorId)&&(doctor==='all'||d.id===doctor));
 const dayAppointments=data.appointments.filter(a=>a.date===selectedDate&&a.status!=='cancelled');
 const searched=(a:Appointment)=>(doctor==='all'||a.doctorId===doctor)&&(statusFilter==='all'||a.status===statusFilter)&&(!query||(pName(a.patientId)+' '+a.serviceName+' '+dName(a.doctorId)).toLowerCase().includes(query.toLowerCase()));
 const shownAppointments=dayAppointments.filter(searched).sort((a,b)=>a.time.localeCompare(b.time));
 const completed=dayAppointments.filter(a=>a.status==='completed');
 const patient=data.patients.find(p=>p.id===patientId);
 const history=data.appointments.filter(a=>searched(a)&&(!from||a.date>=from)&&(!until||a.date<=until)).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
 const monday=shiftDate(selectedDate,-((new Date(selectedDate+'T12:00:00').getDay()+6)%7));
 const title:Record<Section,string>={schedule:'Расписание',patients:patient?'Карта пациента':'Пациенты',records:'История приёмов',services:'Услуги и цены',team:'Врачи и сотрудники'};
 const primaryAction=()=>{if(section==='patients')open({kind:'patient',item:undefined});else if(section==='services')open({kind:'service'});else if(section==='team')open({kind:'doctor'});else open({kind:'appointment'})};
 const primaryLabel=section==='patients'?'Новый пациент':section==='services'?'Добавить услугу':section==='team'?'Добавить врача':'Новая запись';
 const table=(rows:Appointment[])=><div className="table-wrap"><table><thead><tr><th>Дата и время</th><th>Пациент / услуга</th><th>Врач</th><th>Статус</th><th>Стоимость</th><th/></tr></thead><tbody>{rows.map(a=><tr key={a.id} onClick={()=>open({kind:'detail',item:a})} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')open({kind:'detail',item:a})}}><td><b>{pretty(a.date,{day:'numeric',month:'short'})}</b><small>{a.time} — {endTime(a)}</small></td><td><b>{pName(a.patientId)}</b><small>{a.serviceName}</small></td><td>{dName(a.doctorId)}</td><td><Badge status={a.status}/></td><td><b>{rub(a.price)}</b><small className={a.paid?'green-text':''}>{a.paid?'Оплачено':a.status==='completed'?'Ожидает оплаты':'По записи'}</small></td><td><ChevronRight size={16}/></td></tr>)}</tbody></table>{!rows.length&&<Empty title="Записей пока нет">Выберите другой период или создайте новую запись.</Empty>}</div>;
 return <div className="app">
  <aside className={'sidebar '+(menu?'is-open':'')}>
   <a className="brand" href="#" onClick={e=>{e.preventDefault();go('schedule')}}><div className="brand-mark"><Tooth/></div><span>дента<span className="brand-dot">.</span></span></a>
   <nav>{nav.map(([id,Icon,label])=><button key={id} className={'nav-item '+(section===id?'active':'')} onClick={()=>go(id)}><Icon size={19}/><span>{label}</span>{id==='schedule'&&<em>{data.appointments.filter(a=>a.date===dateNow()&&a.status!=='cancelled').length}</em>}</button>)}</nav>
   <div className="sidebar-bottom"><div className="account"><div className="avatar small mint">{admin?'АД':'ВР'}</div><div><b>{admin?'Администратор':'Врач'}</b><small>Личный аккаунт</small></div><a href="/signout-with-chatgpt?return_to=/" target="_top" aria-label="Выйти" title="Выйти"><LogOut size={17}/></a></div></div>
  </aside>
  {menu&&<div className="sidebar-scrim" onClick={()=>setMenu(false)}/>}
  <div className="workspace">
   <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={()=>setMenu(!menu)} aria-label="Открыть меню"><Menu size={20}/></button><b>Стоматологическая клиника</b></div><div className="topbar-right"><span className="demo-tag" title="Не вводите реальные сведения о пациентах">Тестовая база · вымышленные данные</span><span className="topbar-divider"/><button className="icon-button" onClick={refresh} title="Обновить данные" aria-label="Обновить"><RefreshCw size={17}/></button><div className="avatar tiny mint">{admin?'А':'В'}</div></div></header>
   <main>
    <div className="page-heading"><div><h1>{title[section]}{section==='patients'&&!patient&&<span className="title-count">{data.patients.length}</span>}</h1></div>{(!['services','team'].includes(section)||admin)&&!patient&&<button className="primary" onClick={primaryAction}><Plus size={18}/>{primaryLabel}</button>}</div>
    {error&&<div className="form-error">{error}</div>}
    {section==='schedule'&&<>
     <div className="stats"><Stat icon={<CalendarDays size={19}/>} label="Записей на день" value={String(dayAppointments.length)} note={pretty(selectedDate,{weekday:'long'})}/><Stat icon={<CheckCheck size={19}/>} label="Завершено" value={String(completed.length)} note={'из '+dayAppointments.length+' приёмов'}/><Stat icon={<Users size={19}/>} label="В клинике" value={String(dayAppointments.filter(a=>a.status==='arrived').length)} note="ожидают приёма" accent/><Stat icon={<Wallet size={19}/>} label="Оплачено за день" value={rub(completed.filter(a=>a.paid).reduce((s,a)=>s+a.price,0))} note="по завершённым приёмам"/></div>
     <section className="schedule-panel">
      <div className="calendar-top"><div className="date-controls"><h2>{pretty(selectedDate,{month:'long',year:'numeric'})}<ChevronDown size={16}/><input type="date" value={selectedDate} onChange={e=>{if(e.target.value)setDate(e.target.value)}} aria-label="Выбрать дату"/></h2><div className="nav-arrows"><button className="icon-button" onClick={()=>setDate(shiftDate(selectedDate,-7))} aria-label="Предыдущая неделя"><ChevronLeft size={17}/></button><button className="icon-button" onClick={()=>setDate(shiftDate(selectedDate,7))} aria-label="Следующая неделя"><ChevronRight size={17}/></button></div><button className="subtle-button" onClick={()=>setDate(dateNow())}>Сегодня</button></div><div className="segmented"><button className={view==='day'?'selected':''} onClick={()=>setView('day')}><LayoutGrid size={15}/>День</button><button className={view==='list'?'selected':''} onClick={()=>setView('list')}><List size={15}/>Список</button></div></div>
      <div className="week-strip">{Array.from({length:7},(_,i)=>{const d=shiftDate(monday,i);const count=data.appointments.filter(a=>a.date===d&&a.status!=='cancelled').length;return <button key={d} className={'week-day '+(selectedDate===d?'selected ':'')+(d===dateNow()?'today':'')} onClick={()=>setDate(d)}><span>{pretty(d,{weekday:'short'})}</span><b>{new Date(d+'T12:00:00').getDate()}</b><small>{count?plural(count,['запись','записи','записей']):'Нет записей'}</small>{d===dateNow()&&<i/>}</button>})}</div>
      <div className="schedule-tools"><div className="doctors-label"><select value={doctor} onChange={e=>setDoctor(e.target.value)} aria-label="Фильтр по врачу"><option value="all">Все врачи</option>{data.doctors.filter(d=>admin||d.id===data.me.doctorId).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><span className="count-soft">{activeDoctors.length}</span></div><div className="search compact"><Search size={16}/><input placeholder="Найти пациента или услугу" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Поиск записей"/></div></div>
      {view==='list'?table(shownAppointments):<div className="calendar-scroll"><div className="calendar" style={{minWidth:Math.max(630,activeDoctors.length*240+65)}}><div className="calendar-doctors" style={{gridTemplateColumns:'64px repeat('+activeDoctors.length+', 1fr)'}}><div className="timezone">МСК</div>{activeDoctors.map(d=><div className="doctor-heading" key={d.id}><span className={'avatar '+d.color}>{d.initials}</span><div><b>{d.name}</b><small>{d.specialty}</small></div><span className="doctor-count">{dayAppointments.filter(a=>a.doctorId===d.id).length}</span></div>)}</div><div className="calendar-body" style={{gridTemplateColumns:'64px repeat('+activeDoctors.length+', 1fr)'}}><div className="time-rail">{Array.from({length:11},(_,i)=><span key={i} style={{top:i*100}}>{String(i+9).padStart(2,'0')}:00</span>)}</div>{activeDoctors.map(d=><div className="doctor-column" key={d.id}>{Array.from({length:20},(_,i)=><button className="empty-slot" key={i} style={{top:i*50}} onClick={()=>open({kind:'appointment',doctorId:d.id,time:String(9+Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00')})} aria-label={'Записать: '+d.name+', '+String(9+Math.floor(i/2))+':'+(i%2?'30':'00')}><Plus size={14}/></button>)}{shownAppointments.filter(a=>a.doctorId===d.id).map(a=><button key={a.id} className={'appointment '+d.color+' '+(a.status==='completed'?'is-complete':'')+' '+(a.duration<=30?'short':'')} style={{top:(minutes(a.time)-540)/60*100+3,height:a.duration/60*100-6}} onClick={()=>open({kind:'detail',item:a})}><div className="appointment-time"><span>{a.time} — {endTime(a)}</span>{a.status==='completed'?<CheckCheck size={14}/>:<i className={'status-dot '+a.status}/>}</div><strong>{pName(a.patientId)}</strong><span className="appointment-service">{a.serviceName}</span>{a.duration>=60&&<span className="appointment-bottom">{a.status==='arrived'?'● В клинике':a.status==='completed'?'Приём завершён':rub(a.price)}<ArrowUpRight size={13}/></span>}</button>)}</div>)}</div></div></div>}
      <div className="calendar-legend"><div>{(['all','scheduled','confirmed','arrived','completed'] as const).map(s=><button key={s} onClick={()=>setStatusFilter(s)} className={statusFilter===s?'active':''}><i className={'status-dot '+s}/>{s==='all'?'Все записи':s==='scheduled'?'Не подтверждены':s==='confirmed'?'Подтверждены':s==='arrived'?'В клинике':'Завершены'}</button>)}</div><span><Clock size={13}/>09:00–19:00 · МСК</span></div>
     </section>
    </>}
    {section==='patients'&&!patient&&<>
     <div className="panel"><div className="panel-toolbar"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти по имени или телефону" aria-label="Поиск пациентов"/></div><span className="muted">{data.patients.length} пациентов в клинике</span></div><div className="table-wrap"><table className="patients-table"><thead><tr><th>Пациент</th><th>Телефон</th><th>Последний приём</th><th>План лечения</th><th/></tr></thead><tbody>{data.patients.filter(p=>(p.name+' '+p.phone).toLowerCase().includes(query.toLowerCase())).map(p=>{const last=data.appointments.filter(a=>a.patientId===p.id&&a.status==='completed').sort((a,b)=>b.date.localeCompare(a.date))[0];const planned=data.plans.filter(x=>x.patientId===p.id&&!x.done).length;return <tr key={p.id} tabIndex={0} onClick={()=>selectPatient(p.id)} onKeyDown={e=>{if(e.key==='Enter')selectPatient(p.id)}}><td><div className="person"><span className="avatar neutral">{initials(p.name)}</span><div><b>{p.name}</b><small>В клинике с {pretty(p.created,{month:'long',year:'numeric'})}</small></div></div></td><td>{p.phone}</td><td>{last?pretty(last.date):'Ещё не было'}</td><td>{planned?<span className="soft-pill">{plural(planned,['предстоящий этап','предстоящих этапа','предстоящих этапов'])}</span>:<span className="muted">Не составлен</span>}</td><td><ArrowUpRight size={17}/></td></tr>})}</tbody></table>{!data.patients.some(p=>(p.name+' '+p.phone).toLowerCase().includes(query.toLowerCase()))&&<Empty title="Пациенты не найдены">Попробуйте другое имя или номер телефона.</Empty>}</div></div>
    </>}
    {section==='patients'&&patient&&<PatientView patient={patient} data={data} tab={patientTab} setTab={setPatientTab} onBack={()=>setPatientId(null)} onEdit={()=>open({kind:'patient',item:patient})} onBook={()=>open({kind:'appointment',patientId:patient.id})} onPlan={()=>open({kind:'plan',patientId:patient.id})} onEditPlan={plan=>open({kind:'plan',item:plan,patientId:patient.id})} onBookPlan={plan=>open({kind:'appointment',plan})} onCompletePlan={id=>mutate('plan.complete',{id},false)} onVisit={a=>open({kind:'detail',item:a})} passport={passport} onReveal={async()=>{const r=await mutate('patient.reveal',{id:patient.id},false);if(r)setPassport(r.passport??'')}} admin={admin} busy={busy}/>}
    {section==='records'&&<>
     <div className="stats three"><Stat icon={<ClipboardList size={19}/>} label="Завершённые приёмы" value={String(history.filter(a=>a.status==='completed').length)} note="за выбранный период"/><Stat icon={<Wallet size={19}/>} label="Оказано услуг" value={rub(history.filter(a=>a.status==='completed').reduce((s,a)=>s+a.price,0))} note="стоимость на момент записи"/><Stat icon={<CheckCircle2 size={19}/>} label="Оплачено" value={rub(history.filter(a=>a.paid).reduce((s,a)=>s+a.price,0))} note="по выбранным записям" accent/></div>
     <div className="panel"><div className="panel-toolbar wrap"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Пациент, врач или услуга" aria-label="Поиск в истории"/></div><div className="filters"><label>С<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>По<input type="date" value={until} onChange={e=>setUntil(e.target.value)}/></label><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Статус приёма"><option value="all">Все статусы</option>{Object.entries(statuses).map(([s,n])=><option key={s} value={s}>{n}</option>)}</select></div></div>{table(history)}</div>
    </>}
    {section==='services'&&<>
     <div className="services-tools"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск услуг" aria-label="Поиск услуг"/></div><span className="muted">{data.services.filter(s=>s.active).length} действующих услуг</span></div>
     <div className="category-tabs">{['Все услуги',...new Set(data.services.map(s=>s.category)),'Архив'].map(c=><button key={c} className={category===c?'selected':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>
     <div className="service-grid">{data.services.filter(s=>(category==='Архив'?!s.active:s.active&&(category==='Все услуги'||s.category===category))&&(s.name+' '+s.description).toLowerCase().includes(query.toLowerCase())).map(s=><article className="service-card" key={s.id}><div className="service-card-top"><span className="category-label">{s.category}</span>{admin&&<button className="icon-button" onClick={()=>open({kind:'service',item:s})} aria-label={'Редактировать '+s.name}><Pencil size={16}/></button>}</div><h3>{s.name}</h3><p>{s.description||'Описание пока не добавлено'}</p><div className="service-card-bottom"><strong>{rub(s.price)}</strong><span><Clock size={14}/>{s.duration} мин</span></div></article>)}</div>
     {!data.services.some(s=>(category==='Архив'?!s.active:s.active&&(category==='Все услуги'||s.category===category))&&(s.name+' '+s.description).toLowerCase().includes(query.toLowerCase()))&&<Empty title="Услуг пока нет">Добавьте услугу или выберите другую категорию.</Empty>}
    </>}
    {section==='team'&&<><div className="content-tabs team-tabs">{[['doctors','Врачи'],...(admin?[['members','Сотрудники'],['audit','Журнал изменений']]:[])].map(([id,label])=><button key={id} className={teamTab===id?'selected':''} onClick={()=>setTeamTab(id)}>{label}</button>)}</div>
    {teamTab==='doctors'&&<div className="panel table-wrap"><table><thead><tr><th>Врач</th><th>Специализация</th><th>Записей сегодня</th><th/></tr></thead><tbody>{data.doctors.map(d=><tr key={d.id}><td><div className="person"><span className={'avatar '+d.color}>{d.initials}</span><b>{d.name}</b></div></td><td>{d.specialty}</td><td>{data.appointments.filter(a=>a.doctorId===d.id&&a.date===dateNow()&&a.status!=='cancelled').length}</td><td><div className="button-row"><button className="secondary" onClick={()=>{go('schedule');setDoctor(d.id)}}>Расписание</button>{admin&&<button className="icon-button" aria-label={'Изменить врача '+d.name} onClick={()=>open({kind:'doctor',item:d})}><Pencil size={16}/></button>}</div></td></tr>)}</tbody></table>{!data.doctors.length&&<Empty title="Врачи не добавлены">Добавьте врача, чтобы создать расписание.</Empty>}</div>}
    {admin&&teamTab==='members'&&<div className="panel"><div className="panel-toolbar"><span className="muted">{deployment==='sites'?'Для входа сотруднику также нужен доступ к закрытому сайту.':'Пароль сотрудника задаётся системным администратором на сервере.'}</span><button className="secondary" onClick={()=>open({kind:'member'})}><Plus size={16}/>Добавить сотрудника</button></div><div className="table-wrap"><table><thead><tr><th>Email</th><th>Роль</th><th>Врач</th><th>Статус</th><th/></tr></thead><tbody>{data.members.map(m=><tr key={m.id}><td><b>{m.email}</b>{m.owner&&<small>Владелец</small>}</td><td>{m.role==='admin'?'Администратор':'Врач'}</td><td>{m.doctorId?dName(m.doctorId):'—'}</td><td>{m.active?'Активен':'Отключён'}</td><td>{!m.owner&&<button className="icon-button" onClick={()=>open({kind:'member',item:m})} aria-label="Изменить сотрудника"><Pencil size={16}/></button>}</td></tr>)}</tbody></table></div></div>}
    {admin&&teamTab==='audit'&&<div className="panel"><div className="panel-toolbar"><span className="muted">Последние 150 изменений и просмотров паспортных данных</span></div>{data.audit.length?<div className="table-wrap"><table><thead><tr><th>Время · МСК</th><th>Сотрудник</th><th>Действие</th></tr></thead><tbody>{data.audit.map(a=><tr key={a.id}><td>{new Date(a.at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})}</td><td>{data.members.find(m=>m.id===a.actor)?.email||'Сотрудник'}</td><td>{({'patient.save':'Сохранена карточка пациента','patient.reveal':'Просмотр паспортных данных','appointment.save':'Сохранена запись','appointment.status':'Изменён статус приёма','appointment.pay':'Отмечена оплата','plan.save':'Сохранён этап лечения','plan.complete':'Завершён этап лечения','service.save':'Изменена услуга','member.save':'Изменён сотрудник','doctor.save':'Изменён врач'} as Record<string,string>)[a.action]||a.action}</td></tr>)}</tbody></table></div>:<Empty title="Журнал пуст"/>}</div>}
    </>}
   </main>
  </div>
  {toast&&<div className="toast" role="status"><CheckCircle2 size={18}/>{toast}<button aria-label="Скрыть уведомление" onClick={()=>setToast('')}><X size={15}/></button></div>}
  {modal&&<ModalContent key={modal.kind+':'+(modal.item?.id||modal.plan?.id||'new')} modal={modal} data={data} date={selectedDate} error={modalError} busy={busy} close={()=>setModal(null)} save={mutate} open={open} selectPatient={selectPatient}/>}
 </div>
}
function Tooth(){return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M12 7c-6 1-6 8-3 15 2 5 3 11 6 11s2-12 5-12 2 12 5 12 4-6 6-11c3-7 3-14-3-15-4-1-5 2-8 2s-4-3-8-2Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round"/><path d="M15 10c3 2 5 3 9 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
function Stat({icon,label,value,note,accent=false}:{icon:ReactNode;label:string;value:string;note:string;accent?:boolean}){return <article className={'stat '+(accent?'accent':'')}><div><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><small>{note}</small></article>}
function PatientView({patient:p,data,tab,setTab,onBack,onEdit,onBook,onPlan,onEditPlan,onBookPlan,onCompletePlan,onVisit,passport,onReveal,admin,busy}:{patient:Patient;data:ViewState;tab:string;setTab:(v:string)=>void;onBack:()=>void;onEdit:()=>void;onBook:()=>void;onPlan:()=>void;onEditPlan:(plan:Plan)=>void;onBookPlan:(plan:Plan)=>void;onCompletePlan:(id:string)=>void;onVisit:(a:Appointment)=>void;passport:string|null;onReveal:()=>void;admin:boolean;busy:boolean}){
 const visits=data.appointments.filter(a=>a.patientId===p.id).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));const plans=data.plans.filter(x=>x.patientId===p.id).sort((a,b)=>a.date.localeCompare(b.date));const completed=visits.filter(a=>a.status==='completed');const next=visits.filter(a=>a.date>=dateNow()&&!['completed','cancelled'].includes(a.status)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
 const history=()=>visits.length?<div className="visit-timeline">{visits.map(a=><button className="visit-item" onClick={()=>onVisit(a)} key={a.id}><div className="visit-dot"><FileText size={17}/></div><div><div className="visit-title"><strong>{a.serviceName}</strong><Badge status={a.status}/></div><p>{a.clinicalNote||a.note||'Результат будет добавлен после приёма.'}</p><small>{pretty(a.date)} · {a.time} · {data.doctors.find(d=>d.id===a.doctorId)?.name}</small></div><b>{rub(a.price)}<ChevronRight size={16}/></b></button>)}</div>:<Empty title="Приёмов пока нет">Создайте первую запись на приём.</Empty>;
 const plan=()=> <TreatmentPlan plans={plans} data={data} busy={busy} onEdit={onEditPlan} onBook={onBookPlan} onVisit={onVisit} onComplete={onCompletePlan}/>;
 return <><button className="text-button back-button" onClick={onBack}><ArrowLeft size={16}/>Все пациенты</button><div className="patient-header panel"><div className="person"><div className="avatar large mint">{initials(p.name)}</div><div><h2>{p.name}</h2><p><Phone size={14}/>{p.phone}<span>·</span>{p.birth?pretty(p.birth,{day:'numeric',month:'long',year:'numeric'}):'Дата рождения не указана'}</p></div></div><div className="button-row">{admin&&<button className="secondary" onClick={onEdit}><Pencil size={15}/>Изменить</button>}<button className="primary" onClick={onBook}><Plus size={17}/>Записать на приём</button></div></div><div className="patient-layout"><aside><div className="panel patient-summary"><h3>Кратко о пациенте</h3><div><span>Завершено приёмов</span><b>{completed.length}</b></div><div><span>Оплачено услуг</span><b>{rub(completed.filter(a=>a.paid).reduce((s,a)=>s+a.price,0))}</b></div><div><span>Этапов в плане</span><b>{plans.filter(p=>!p.done).length}</b></div><hr/><h4>Следующий приём</h4>{next?<button className="next-visit" onClick={()=>onVisit(next)}><CalendarDays size={18}/><div><b>{pretty(next.date)}, {next.time}</b><span>{next.serviceName}</span></div><ArrowUpRight size={15}/></button>:<p className="muted">Пока не запланирован</p>}</div><div className="patient-notes"><FileText size={19}/><h4>Заметка о пациенте</h4><p>{p.notes||'Заметок пока нет.'}</p></div></aside><div className="panel patient-main"><div className="content-tabs">{[['overview','Обзор'],['history','История приёмов'],['plan','План лечения'],['personal','Личные данные']].map(([id,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}</div>{tab==='overview'&&<><div className="section-heading"><h2>План лечения</h2><button className="text-button" onClick={onPlan}><Plus size={16}/>Добавить этап</button></div>{plan()}<div className="section-heading border-top"><h2>Приёмы пациента</h2><span className="count-soft">{visits.length}</span></div>{history()}</>}{tab==='history'&&<><div className="section-heading"><h2>История приёмов</h2><span className="count-soft">{visits.length}</span></div>{history()}</>}{tab==='plan'&&<><div className="section-heading"><h2>План лечения</h2><button className="secondary" onClick={onPlan}><Plus size={16}/>Добавить этап</button></div>{plan()}<div className="plan-total"><span>Стоимость предстоящих этапов</span><strong>{rub(plans.filter(p=>!p.done).reduce((s,p)=>s+p.price,0))}</strong></div></>}{tab==='personal'&&<div className="personal-data"><div className="info-inline"><LockKeyhole size={17}/>Конфиденциальная информация</div><dl><dt>ФИО</dt><dd>{p.name}</dd><dt>Дата рождения</dt><dd>{pretty(p.birth,{day:'numeric',month:'long',year:'numeric'})}</dd><dt>Телефон</dt><dd>{p.phone}</dd>{admin&&<><dt>Адрес</dt><dd>{p.address||'Не указан'}</dd><dt>Паспортные данные</dt><dd className="passport-value">{passport!==null?passport||'Не указаны':<><span>•••• ••••••</span><button className="secondary" disabled={busy} onClick={onReveal}><Eye size={15}/>Показать на 30 секунд</button></>}</dd></>}</dl>{!admin&&<p className="muted">Адрес и паспортные данные доступны только администратору.</p>}</div>}</div></div></>
}
function TreatmentPlan({plans,data,busy,onEdit,onBook,onVisit,onComplete}:{
 plans:Plan[];data:ViewState;busy:boolean;onEdit:(plan:Plan)=>void;onBook:(plan:Plan)=>void;
 onVisit:(appointment:Appointment)=>void;onComplete:(id:string)=>void;
}){
 if(!plans.length)return <Empty title="План лечения ещё не составлен">Добавьте этап лечения.</Empty>;
 return <div className="plans">{plans.map(plan=>{
  const booking=data.appointments.find(appointment=>appointment.planId===plan.id&&appointment.status!=='cancelled');
  const canEdit=data.me.role==='admin'||plan.doctorId===data.me.doctorId;
  const bookable=data.services.some(service=>service.id===plan.serviceId&&service.active);
  const doctorName=data.doctors.find(doctor=>doctor.id===plan.doctorId)?.name;
  return <article className={'plan-item '+(plan.done?'done':'')} key={plan.id}>
   <div className="plan-content">
    <h3>{plan.title}{plan.tooth&&<span className="soft-pill">Зуб {plan.tooth}</span>}</h3>
    {plan.note&&<p>{plan.note}</p>}
    <small>{doctorName} · {booking?'Приём '+pretty(booking.date)+', '+booking.time:'Плановая дата '+pretty(plan.date)}</small>
   </div>
   <div className="plan-actions">
    <b>{rub(plan.price)}</b>
    {plan.done&&<span className="green-text">Выполнено</span>}
    {booking&&<button className="text-button" onClick={()=>onVisit(booking)}>Открыть приём<ChevronRight size={14}/></button>}
    {!plan.done&&!booking&&canEdit&&<div className="plan-buttons">
     {bookable&&<button className="secondary" disabled={busy} onClick={()=>onBook(plan)}>Записать</button>}
     <button className="icon-button" disabled={busy} onClick={()=>onEdit(plan)} title="Изменить этап" aria-label={'Изменить этап: '+plan.title}><Pencil size={15}/></button>
     <button className="icon-button" disabled={busy} onClick={()=>onComplete(plan.id)} title="Отметить выполненным" aria-label={'Отметить этап выполненным: '+plan.title}><Check size={17}/></button>
    </div>}
   </div>
  </article>
 })}</div>
}
function AppointmentEditor({modal, data, date, error, busy, close, save}: {
 modal: Modal;
 data: ViewState;
 date: string;
 error: string;
 busy: boolean;
 close: () => void;
 save: (action: string, payload: unknown) => Promise<unknown>;
}) {
 const existing = modal.item as Appointment | undefined;
 const plan = modal.plan ?? data.plans.find(stage => stage.id === existing?.planId);
 const services = data.services.filter(service => service.active || service.id === existing?.serviceId);
 const doctors = data.doctors.filter(doctor => data.me.role === 'admin' || doctor.id === data.me.doctorId);
 const [patientId, setPatientId] = useState(plan?.patientId ?? existing?.patientId ?? modal.patientId ?? '');
 const [doctorId, setDoctorId] = useState(plan?.doctorId ?? existing?.doctorId ?? modal.doctorId ?? doctors[0]?.id ?? '');
 const [serviceId, setServiceId] = useState(plan?.serviceId ?? existing?.serviceId ?? services[0]?.id ?? '');
 const service = services.find(entry => entry.id === serviceId);
 const [duration, setDuration] = useState(existing?.duration ?? service?.duration ?? 30);
 const [bookingDate, setBookingDate] = useState(existing?.date ?? (plan ? (plan.date < dateNow() ? dateNow() : plan.date) : date));
 const [time, setTime] = useState(existing?.time ?? modal.time ?? '');
 const [retry, setRetry] = useState(0);
 const [result, setResult] = useState<{key: string; times?: string[]; error?: string}>();
 const booking = {patientId, doctorId, date: bookingDate, duration, id: existing?.id};
 const request = patientId && doctorId && bookingDate && service
  ? JSON.stringify({action: 'appointment.availability', revision: data.revision, data: booking})
  : '';
 const key = request + '|' + retry;
 const availability = result?.key === key ? result : undefined;
 const times = availability?.times ?? [];
 const selectedTime = times.includes(time) ? time : '';

 useEffect(() => {
  if (!request) return;
  const controller = new AbortController();
  async function loadTimes() {
   try {
    const response = await fetch('/api/clinic', {
     method: 'POST',
     headers: {'Content-Type': 'application/json'},
     body: request,
     signal: controller.signal,
    });
    const payload = await response.json() as {times: string[]; error?: string};
    if (!response.ok) throw new Error(payload.error);
    if (!controller.signal.aborted) setResult({key, times: payload.times});
   } catch (cause) {
    if (!controller.signal.aborted) {
     setResult({key, error: cause instanceof Error ? cause.message : 'Попробуйте ещё раз.'});
    }
   }
  }
  void loadTimes();
  return () => controller.abort();
 }, [request, key]);

 function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!selectedTime || busy) return;
  const note = new FormData(event.currentTarget).get('note');
  void save('appointment.save', {...booking, serviceId, time: selectedTime, note, planId: plan?.id});
 }

 let timePlaceholder = 'Выберите время';
 if (!request) timePlaceholder = 'Укажите пациента, врача, услугу и дату';
 else if (!availability) timePlaceholder = 'Проверяем расписание…';
 else if (availability.error) timePlaceholder = 'Не удалось проверить расписание';
 else if (!times.length) timePlaceholder = 'Свободного времени нет';

 const price = existing?.serviceId === serviceId ? existing.price : plan?.price ?? service?.price ?? 0;
 return <Dialog title={existing ? 'Изменить запись' : plan ? 'Запись по плану' : 'Новая запись'} subtitle={plan?.title} onClose={close}>
  <form onSubmit={submit} className="editor-form">
   <div className="form-grid">
    <Field label="Пациент *" wide>
     <select value={patientId} onChange={event => setPatientId(event.target.value)} disabled={!!plan} required>
      <option value="" disabled>Выберите пациента</option>
      {data.patients.map(patient => <option value={patient.id} key={patient.id}>{patient.name} · {patient.phone}</option>)}
     </select>
    </Field>
    <Field label="Врач *" wide>
     <select value={doctorId} onChange={event => setDoctorId(event.target.value)} disabled={!!plan} required>
      <option value="" disabled>Выберите врача</option>
      {doctors.map(doctor => <option value={doctor.id} key={doctor.id}>{doctor.name}</option>)}
     </select>
    </Field>
    <Field label="Услуга *" wide>
     <select disabled={!!plan} value={serviceId} onChange={event => {
      const next = services.find(entry => entry.id === event.target.value);
      if (next) {
       setServiceId(next.id);
       setDuration(next.id === existing?.serviceId ? existing.duration : next.duration);
      }
     }} required>
      <option value="" disabled>Выберите услугу</option>
      {services.map(entry => <option value={entry.id} key={entry.id}>{entry.name} · {rub(entry.price)}</option>)}
     </select>
    </Field>
    <Field label="Дата *">
     <input type="date" value={bookingDate} onChange={event => setBookingDate(event.target.value)} required/>
    </Field>
    <Field label="Длительность">
     <select value={duration} onChange={event => setDuration(Number(event.target.value))}>
      {Array.from({length: 16}, (_, index) => (index + 1) * appointmentStep).map(value =>
       <option key={value} value={value}>{value} мин</option>
      )}
     </select>
    </Field>
    <Field label="Свободное время · МСК *">
     <select value={selectedTime} onChange={event => setTime(event.target.value)} disabled={!times.length} required>
      <option value="" disabled>{timePlaceholder}</option>
      {times.map(start => <option key={start} value={start}>{start}–{clockTime(minutes(start) + duration)}</option>)}
     </select>
    </Field>
    <div className="form-price"><span>Стоимость записи</span><b>{rub(price)}</b></div>
    {availability?.error && <div className="form-error wide" role="alert">
     <span>{availability.error}</span>
     <button type="button" className="text-button" onClick={() => setRetry(count => count + 1)}>Проверить ещё раз</button>
    </div>}
    {availability?.times && !times.length && <p className="form-hint wide" role="status">Выберите другую дату или измените длительность.</p>}
    <Field label="Комментарий к записи" wide>
     <textarea name="note" rows={2} maxLength={2000} defaultValue={existing?.note} placeholder="Например, пациенту удобно после 15:00"/>
    </Field>
   </div>
   {error && <div className="form-error" role="alert"><AlertCircle size={16}/>{error}</div>}
   <div className="form-footer">
    <button type="button" className="secondary" disabled={busy} onClick={close}>Закрыть</button>
    <button type="submit" className="primary" disabled={busy || !selectedTime}>
     {busy ? 'Сохраняем…' : 'Сохранить запись'}{!busy && <Check size={16}/>}
    </button>
   </div>
  </form>
 </Dialog>
}
function ModalContent({modal:m,data,date,error,busy,close,save,open,selectPatient}:{modal:Modal;data:ViewState;date:string;error:string;busy:boolean;close:()=>void;save:(action:string,payload:any,close?:boolean)=>Promise<any>;open:(m:Modal)=>void;selectPatient:(id:string)=>void}){
 const item=m.item||{},admin=data.me.role==='admin';
 const [serviceId,setService]=useState(item.serviceId||data.services.find(s=>s.active)?.id||'');const [role,setRole]=useState(item.role||'doctor');const [showPassport,setShowPassport]=useState(false);const service=data.services.find(s=>s.id===serviceId);
 const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const b:any=Object.fromEntries(new FormData(e.currentTarget));if(item.id)b.id=item.id;
 if(m.kind==='patient'){b.replacePassport=b.replacePassport==='on';await save('patient.save',b)}
 if(m.kind==='service'){b.price=Number(b.price);b.duration=Number(b.duration);b.active=b.active==='on';await save('service.save',b)}
 if(m.kind==='plan'){b.patientId=m.patientId;await save('plan.save',b)}
 if(m.kind==='doctor')await save('doctor.save',b);
 if(m.kind==='member'){b.active=b.active==='on';await save('member.save',b)}
 if(m.kind==='complete')await save('appointment.status',{id:item.id,status:'completed',clinicalNote:b.clinicalNote});
 if(m.kind==='cancel')await save('appointment.status',{id:item.id,status:'cancelled'});
 };
 const doctorOptions=<>{data.doctors.filter(d=>admin||d.id===data.me.doctorId).map(d=><option value={d.id} key={d.id}>{d.name}</option>)}</>;
 const services=<>{data.services.filter(s=>s.active||s.id===item.serviceId).map(s=><option value={s.id} key={s.id}>{s.name} · {rub(s.price)}</option>)}</>;
 const titles:Record<string,string>={patient:item.id?'Изменить карточку':'Новый пациент',service:item.id?'Изменить услугу':'Новая услуга',plan:item.id?'Изменить этап':'Новый этап лечения',doctor:item.id?'Изменить врача':'Добавить врача',member:item.id?'Изменить доступ':'Доступ сотрудника',complete:'Завершение приёма',cancel:'Отменить запись'};
 if(m.kind==='appointment')return <AppointmentEditor modal={m} data={data} date={date} error={error} busy={busy} close={close} save={save}/>;
 if(m.kind==='detail'){
 const a=data.appointments.find(x=>x.id===item.id)!;const p=data.patients.find(x=>x.id===a.patientId);return <Dialog title={a.serviceName} subtitle={pretty(a.date,{day:'numeric',month:'long',year:'numeric'})+' · '+a.time+'–'+endTime(a)} onClose={close}><div className="detail-body"><Badge status={a.status}/><button className="detail-patient" onClick={()=>selectPatient(a.patientId)}><span className="avatar mint">{initials(p?.name||'П')}</span><div><strong>{p?.name}</strong><small>{p?.phone}</small></div><ArrowUpRight size={18}/></button><dl className="detail-grid"><div><dt>Лечащий врач</dt><dd>{data.doctors.find(d=>d.id===a.doctorId)?.name}</dd></div><div><dt>Стоимость услуги</dt><dd>{rub(a.price)} <small>{a.paid?'· Оплачено':''}</small></dd></div><div><dt>Длительность</dt><dd>{a.duration} минут</dd></div><div><dt>Запись</dt><dd>{pretty(a.date)} · {a.time}</dd></div></dl>{a.note&&<div className="note-box"><b>Комментарий к записи</b><p>{a.note}</p></div>}{a.clinicalNote&&<div className="note-box"><b>Результат приёма</b><p>{a.clinicalNote}</p></div>}{error&&<p className="form-error">{error}</p>}<div className="detail-actions">{!['completed','cancelled'].includes(a.status)&&<><button disabled={busy} className="primary" onClick={()=>open({kind:'complete',item:a})}><CheckCheck size={17}/>Завершить приём</button>{a.status==='scheduled'&&<button disabled={busy} className="secondary" onClick={()=>save('appointment.status',{id:a.id,status:'confirmed'},false)}>Подтвердить</button>}{['scheduled','confirmed'].includes(a.status)&&<button disabled={busy} className="secondary" onClick={()=>save('appointment.status',{id:a.id,status:'arrived'},false)}>Пациент пришёл</button>}<button className="secondary" onClick={()=>open({kind:'appointment',item:a})}><Pencil size={15}/>Перенести</button><button className="danger-link" onClick={()=>open({kind:'cancel',item:a})}>Отменить запись</button></>}{a.status==='completed'&&!a.paid&&admin&&<button disabled={busy} className="primary" onClick={()=>save('appointment.pay',{id:a.id},false)}><Wallet size={17}/>Отметить оплату · {rub(a.price)}</button>}{a.paid&&<p className="green-text"><CheckCircle2 size={17}/>Оплата учтена в истории услуг</p>}</div></div></Dialog>
 }
 return <Dialog title={titles[m.kind]||'Изменить'} subtitle={m.kind==='patient'?'Только вымышленные данные для тестовой версии.':undefined} onClose={close}><form onSubmit={submit} className="editor-form"><div className="form-grid">
 {m.kind==='patient'&&<><Field label="Фамилия, имя, отчество *" wide><input name="name" defaultValue={item.name} maxLength={150} required placeholder="Введите ФИО"/></Field><Field label="Телефон *"><input name="phone" type="tel" defaultValue={item.phone} required placeholder="+7 (000) 000-00-00"/></Field><Field label="Дата рождения"><input name="birth" type="date" max={dateNow()} defaultValue={item.birth}/></Field>{admin?<><Field label="Адрес" wide><input name="address" maxLength={2000} defaultValue={item.address}/></Field><Field label="Паспортные данные" wide><div className="password-input"><input name="passport" type={showPassport?'text':'password'} maxLength={300} placeholder={item.id?'Сохранены отдельно · введите для замены':'Серия, номер, кем и когда выдан'}/><button type="button" className="icon-button" aria-label="Показать ввод" onClick={()=>setShowPassport(!showPassport)}><Eye size={16}/></button></div></Field>{item.id?<label className="checkbox-field wide"><input type="checkbox" name="replacePassport"/>Заменить сохранённые паспортные данные</label>:<input type="hidden" name="replacePassport" value="on"/>}</>:<><input type="hidden" name="address" value=""/><input type="hidden" name="passport" value=""/></>}<Field label="Заметка о пациенте" wide><textarea name="notes" maxLength={2000} rows={3} defaultValue={item.notes}/></Field></>}
 {m.kind==='service'&&<><Field label="Название услуги *" wide><input name="name" defaultValue={item.name} required maxLength={150}/></Field><Field label="Категория *" wide><input name="category" list="categories" defaultValue={item.category||'Терапия'} required maxLength={150}/><datalist id="categories">{Array.from(new Set(data.services.map(s=>s.category))).map(c=><option key={c} value={c}/>)}</datalist></Field><Field label="Стоимость, ₽ *"><input type="number" name="price" min="0" max="100000000" step="1" defaultValue={item.price??1500} required/></Field><Field label="Длительность, минут *"><input type="number" name="duration" min="15" max="240" step="15" defaultValue={item.duration||30} required/></Field><Field label="Описание" wide><textarea name="description" rows={3} maxLength={2000} defaultValue={item.description}/></Field><label className="checkbox-field wide"><input type="checkbox" name="active" defaultChecked={item.active!==false}/>Действующая услуга</label><p className="form-hint wide">Изменение цены не изменит стоимость уже созданных записей и этапов лечения.</p></>}
 {m.kind==='plan'&&<><Field label="Услуга *" wide><select name="serviceId" value={serviceId} onChange={e=>setService(e.target.value)} required>{services}</select></Field><Field label="Лечащий врач *" wide><select name="doctorId" defaultValue={item.doctorId||data.me.doctorId||data.doctors[0]?.id} required>{doctorOptions}</select></Field><Field label="Плановая дата *"><input name="date" type="date" defaultValue={item.date||shiftDate(dateNow(),7)} required/></Field><Field label="Номер зуба"><input name="tooth" defaultValue={item.tooth} maxLength={20} placeholder="Например, 26"/></Field><Field label="Описание этапа" wide><textarea name="note" rows={3} maxLength={2000} defaultValue={item.note}/></Field><div className="form-price wide"><span>Стоимость этапа</span><b>{rub(item.serviceId===serviceId?item.price:service?.price||0)}</b></div></>}
 {m.kind==='doctor'&&<><Field label="Имя врача *" wide><input name="name" defaultValue={item.name} required maxLength={150}/></Field><Field label="Специализация *" wide><input name="specialty" defaultValue={item.specialty} required maxLength={150} placeholder="Терапевт, хирург, ортодонт…"/></Field></>}
 {m.kind==='member'&&<><Field label="Email аккаунта сотрудника *" wide><input name="email" type="email" defaultValue={item.email} readOnly={!!item.id} required/></Field><Field label="Роль *" wide><select name="role" value={role} onChange={e=>setRole(e.target.value)}><option value="doctor">Врач</option><option value="admin">Администратор</option></select></Field>{role==='doctor'?<Field label="Карточка врача *" wide><select name="doctorId" defaultValue={item.doctorId||data.doctors[0]?.id} required>{doctorOptions}</select></Field>:<input name="doctorId" type="hidden" value=""/>}<label className="checkbox-field wide"><input name="active" type="checkbox" defaultChecked={item.active!==false}/>Доступ активен</label><p className="form-hint wide">Письмо не отправляется. Для входа сотруднику также требуется доступ к закрытому сайту.</p></>}
 {m.kind==='complete'&&<><div className="note-box wide"><b>{data.patients.find(p=>p.id===item.patientId)?.name}</b><p>{item.serviceName} · {rub(item.price)}</p></div><Field label="Результат приёма *" wide><textarea name="clinicalNote" rows={5} minLength={5} maxLength={5000} required placeholder="Что выполнено, наблюдения и дальнейшие рекомендации"/></Field><p className="form-hint wide">Результат сохранится в истории пациента. После завершения приём нельзя редактировать.</p></>}
 {m.kind==='cancel'&&<p className="wide">Запись пациента {data.patients.find(p=>p.id===item.patientId)?.name} на {pretty(item.date)} в {item.time} будет отменена. Она останется в истории, а время освободится.</p>}
 </div>{error&&<div className="form-error" role="alert"><AlertCircle size={16}/>{error}</div>}<div className="form-footer"><button type="button" className="secondary" disabled={busy} onClick={close}>Закрыть</button><button type="submit" className={m.kind==='cancel'?'danger-button':'primary'} disabled={busy}>{busy?'Сохраняем…':m.kind==='complete'?'Завершить приём':m.kind==='cancel'?'Отменить запись':'Сохранить'}{!busy&&<Check size={16}/>}</button></div></form></Dialog>
}
