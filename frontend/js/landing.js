import { store } from './store.js';

let regState={gender:'male'};

export function initLandingAndAuth(onEnterMainApp){
  const landing=document.getElementById('landing-page');
  const auth=document.getElementById('auth-page');
  const app=document.getElementById('main-app-shell');
  function showView(view){landing?.classList.toggle('hidden',view!=='landing');auth?.classList.toggle('hidden',view!=='auth');app?.classList.toggle('hidden',view!=='app');window.scrollTo({top:0,behavior:'smooth'})}

  if(store.state.isAuthenticated)showView('app');else showView('landing');
  window.openLandingPage=()=>showView('landing');
  window.openAuthGateway=(tab='register')=>{showView('auth');switchTab(tab);updateMetrics()};
  window.signOutToLanding=()=>{store.logout();showView('landing')};

  function switchTab(tab){
    const reg=tab==='register';
    document.getElementById('auth-panel-register')?.classList.toggle('hidden',!reg);
    document.getElementById('auth-panel-login')?.classList.toggle('hidden',reg);
  }
  document.getElementById('tab-btn-register')?.addEventListener('click',()=>switchTab('register'));
  document.getElementById('tab-btn-login')?.addEventListener('click',()=>switchTab('login'));

  document.querySelectorAll('[data-reg-gender]').forEach(btn=>btn.addEventListener('click',()=>{
    regState.gender=btn.dataset.regGender;
    document.querySelectorAll('[data-reg-gender]').forEach(b=>b.className=b.dataset.regGender===regState.gender?'min-h-[46px] rounded-xl border-2 border-emerald-400 bg-emerald-950/50 text-white font-bold':'min-h-[46px] rounded-xl border border-slate-700 bg-slate-800/70 text-slate-300');
    updateMetrics();
  }));

  function updateMetrics(){
    const hUnit=document.getElementById('reg-height-unit')?.value||'cm';
    const wUnit=document.getElementById('reg-weight-unit')?.value||'kg';
    const rawH=Number(document.getElementById('reg-height')?.value||178);
    const rawW=Number(document.getElementById('reg-weight')?.value||70);
    const age=Number(document.getElementById('reg-age')?.value||23);
    const height=hUnit==='ft'?rawH*30.48:rawH;
    const weight=wUnit==='lb'?rawW*0.453592:rawW;
    const hM=Math.max(1.2,height/100);const bmi=(weight/(hM*hM)).toFixed(1);const s=regState.gender==='female'?-161:5;
    const kcal=Math.round((10*weight+6.25*height-5*age+s)*1.2);const zone=Number(bmi)<18.5?'Underweight':Number(bmi)<25?'Healthy Zone':Number(bmi)<30?'Overweight':'High BMI';
    const el=document.getElementById('reg-live-metrics');if(el)el.innerHTML=`<span>Live Analysis: <strong class="text-emerald-400">BMI ${bmi}</strong> (${zone})</span><span>Est. Daily Burn: <strong class="text-sky-400">${kcal.toLocaleString()} kcal</strong></span>`;
  }
  ['reg-height','reg-weight','reg-age','reg-height-unit','reg-weight-unit'].forEach(id=>{document.getElementById(id)?.addEventListener('input',updateMetrics);document.getElementById(id)?.addEventListener('change',updateMetrics)});

  document.getElementById('form-athlete-register')?.addEventListener('submit',async e=>{
    e.preventDefault();const err=document.getElementById('reg-error');err?.classList.add('hidden');
    const age=Number(document.getElementById('reg-age').value);const hUnit=document.getElementById('reg-height-unit').value;const wUnit=document.getElementById('reg-weight-unit').value;
    const payload={displayName:document.getElementById('reg-name').value.trim(),email:document.getElementById('reg-email').value.trim(),password:document.getElementById('reg-password').value,age,birthYear:new Date().getFullYear()-age,gender:regState.gender,heightCm:Number((hUnit==='ft'?Number(document.getElementById('reg-height').value)*30.48:Number(document.getElementById('reg-height').value)).toFixed(1)),weightKg:Number((wUnit==='lb'?Number(document.getElementById('reg-weight').value)*0.453592:Number(document.getElementById('reg-weight').value)).toFixed(1)),goal:document.getElementById('reg-goal').value,equipment:document.getElementById('reg-equipment').value,units:wUnit,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'};
    try{await store.loginOrRegister('register',payload);showView('app');onEnterMainApp()}catch(caught){if(String(caught.message).includes('Failed to fetch')){store.enterOfflineDemo(payload);showView('app');onEnterMainApp()}else{if(err){err.textContent=caught.message;err.classList.remove('hidden')}}}
  });

  document.getElementById('form-athlete-login')?.addEventListener('submit',async e=>{
    e.preventEvent?.();e.preventDefault();const err=document.getElementById('login-error');err?.classList.add('hidden');
    try{await store.loginOrRegister('login',{email:document.getElementById('login-email').value.trim(),password:document.getElementById('login-password').value});showView('app');onEnterMainApp()}catch(caught){if(err){err.textContent=caught.message;err.classList.remove('hidden')}}
  });

  document.getElementById('btn-enter-demo-mode')?.addEventListener('click',()=>{store.enterOfflineDemo({displayName:'Athlete',age:23,gender:'male',heightCm:178,weightKg:70});showView('app');onEnterMainApp()});
}
