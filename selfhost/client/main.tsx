import React,{useState,useEffect} from 'react';
import{createRoot}from'react-dom/client';
import Clinic from '../../app/clinic';
import '../../app/globals.css';
function App(){const [ready,setReady]=useState(false),[signed,setSigned]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
useEffect(()=>{fetch('/api/session').then(r=>{setSigned(r.ok);setReady(true)}).catch(()=>{setError('Сервер недоступен');setReady(true)})},[]);
if(!ready)return <div className="startup"><h1>Дента.</h1><p>Открываем клинику…</p></div>;
if(signed)return <Clinic deployment="selfhost"/>;
return <div className="startup"><div className="panel" style={{width:390,maxWidth:'100%',padding:35,textAlign:'left'}}><h1>Вход в клинику</h1><p style={{margin:'12px 0 24px'}}>Войдите в аккаунт сотрудника</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const form=new FormData(e.currentTarget);try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(form))});if(!r.ok){const body=await r.json() as {error:string};throw new Error(body.error)}setSigned(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><label className="field"><span>Email</span><input type="email" name="email" required autoComplete="username"/></label><label className="field" style={{marginTop:17}}><span>Пароль</span><input type="password" name="password" required autoComplete="current-password"/></label>{error&&<div className="form-error" role="alert">{error}</div>}<button className="primary" style={{marginTop:25,width:'100%'}} disabled={busy}>{busy?'Входим…':'Войти в клинику'}</button></form><p style={{fontSize:10,marginTop:20,lineHeight:1.8}}>Доступ выдаёт администратор клиники. После 15 минут бездействия потребуется повторный вход.</p></div></div>}
createRoot(document.getElementById('root')!).render(<App/>);
