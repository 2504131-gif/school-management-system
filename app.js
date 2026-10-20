"use strict";
/* ---------- storage ---------- */
const KEY="schoolhouse.v1", SKEY="schoolhouse.session";
let mem=null, memSess=null;
const parse=s=>{try{return s?JSON.parse(s):null}catch(e){return null}};
const load=()=>{try{const r=localStorage.getItem(KEY);return r?JSON.parse(r):null}catch(e){return mem}};
let saveWarned=false;
function save(){
  try{localStorage.setItem(KEY,JSON.stringify(DB));mem=null;return true}
  catch(e){mem=DB;if(!saveWarned){saveWarned=true;storageBar()}return false}
}
const getSess=()=>{try{return localStorage.getItem(SKEY)}catch(e){return memSess}};
const setSess=v=>{try{v?localStorage.setItem(SKEY,v):localStorage.removeItem(SKEY)}catch(e){memSess=v}};
function storageBar(){
  const b=document.createElement("div");b.className="storagebar";
  b.innerHTML=`<span><b>Browser storage is full.</b> New changes live in this session only and are lost when you close the tab.</span><button class="btn sm" data-act="backup">Download backup</button><button class="btn sm ghost" data-act="dismissbar">Dismiss</button>`;
  Object.assign(b.style,{position:"fixed",left:"12px",right:"12px",bottom:"12px",zIndex:"60",display:"flex",gap:"10px",alignItems:"center",flexWrap:"wrap",padding:"10px 14px",borderRadius:"10px",background:"#3b1212",color:"#fecaca",boxShadow:"0 8px 30px rgba(0,0,0,.35)"});
  document.body.appendChild(b);
}

/* ---------- Kenyan school setup ---------- */
const LEVELS=["PP1","PP2","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12","Form 3","Form 4"];
const GROUPS={pre:"Pre-primary (PP1 to PP2)",lower:"Lower primary (Grade 1 to 3)",upper:"Upper primary (Grade 4 to 6)",junior:"Junior school (Grade 7 to 9)",senior:"Senior school (Grade 10 to 12)",form:"Forms 3 and 4 (8-4-4)"};
const grpOf=c=>{if(c.startsWith("PP"))return"pre";if(c.startsWith("Form"))return"form";const n=+c.split(" ")[1];return n<=3?"lower":n<=6?"upper":n<=9?"junior":"senior"};
const DEFAULT_SUBJECTS={
  pre:["Language Activities","Mathematical Activities","Environmental Activities","Psychomotor and Creative Activities","Religious Activities"],
  lower:["English","Kiswahili","Indigenous Language","Mathematics","Environmental Activities","Religious Education","Creative Activities"],
  upper:["English","Kiswahili","Mathematics","Science and Technology","Social Studies","Agriculture and Nutrition","Religious Education","Creative Arts"],
  junior:["English","Kiswahili","Mathematics","Integrated Science","Social Studies","Agriculture and Nutrition","Pre-Technical Studies","Religious Education","Creative Arts and Sports"],
  senior:["English","Kiswahili","Mathematics","Community Service Learning","Physical Education","ICT","Elective 1","Elective 2","Elective 3"],
  form:["English","Kiswahili","Mathematics","Biology","Chemistry","Physics","History","Geography","CRE","Business Studies"]};
const EXAMS=["Opener","Mid-term","End-term"];
const METHODS=["M-Pesa","Cash","Bank deposit","Cheque"];
/* Grading bands: [minimum score, grade, points]. Edit here if your school or KNEC changes them. */
const CBC=[[90,"EE1",8],[75,"EE2",7],[58,"ME1",6],[41,"ME2",5],[31,"AE1",4],[21,"AE2",3],[11,"BE1",2],[0,"BE2",1]];
const KCSE=[[80,"A",12],[75,"A-",11],[70,"B+",10],[65,"B",9],[60,"B-",8],[55,"C+",7],[50,"C",6],[45,"C-",5],[40,"D+",4],[35,"D",3],[30,"D-",2],[0,"E",1]];
const gradeOf=(cl,score)=>{const sc=grpOf(cl)==="form"?KCSE:CBC;const r=sc.find(x=>score>=x[0])||sc[sc.length-1];return{g:r[1],pts:r[2]}};
const WORD={EE:"Exceeding expectations",ME:"Meeting expectations",AE:"Approaching expectations",BE:"Below expectations"};
const gradeWord=g=>WORD[g.slice(0,2)]||"";
/* Longest prefix wins: BE1 is Below Expectations, not a B grade, so BE/AE must be tested before B/A. */
const TONES=[["EE","good"],["ME","good"],["AE","warn"],["BE","bad"],["A","good"],["B","good"],["C","warn"],["D","bad"],["E","bad"]];
const gradeTone=g=>{const hit=TONES.find(([p])=>String(g).startsWith(p));return hit?hit[1]:"bad"};
const gradePill=g=>`<span class="pill ${gradeTone(g)}">${g}</span>`;
function remark(cl,mean){
  const {g}=gradeOf(cl,mean),t=gradeTone(g);
  return t==="good"?"Very good performance. Keep up the effort.":t==="warn"?"Fair performance. More effort is needed in the weaker subjects.":"Performance is below expectations. Please meet the class teacher so we can support the learner.";
}
const termForDate=d=>{const m=d.getMonth()+1;return m<=4?1:m<=8?2:3};
const TERM_MONTHS={1:[1,4],2:[5,8],3:[9,12]};
const stampOf=dateStr=>{const d=new Date(dateStr+"T00:00:00");return{term:termForDate(d),year:d.getFullYear()}};

let DB=null, ME=null, V={name:"home"}, UI={};

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>(n==null||n==="")?"—":"KSh "+Number(n).toLocaleString("en-KE");
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const today=()=>ymd(new Date());
const dAgo=n=>{const d=new Date();d.setDate(d.getDate()-n);return ymd(d)};
const HAS_SUBTLE=typeof crypto!=="undefined"&&!!crypto.subtle&&!!crypto.getRandomValues;
const uid=()=>{const a=new Uint8Array(6);if(HAS_SUBTLE)crypto.getRandomValues(a);else for(let i=0;i<6;i++)a[i]=Math.floor(Math.random()*256);return[...a].map(x=>x.toString(36).padStart(2,"0")).join("")};
const fmtDate=s=>{if(!s)return"—";const d=new Date(s+"T00:00:00");return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})};
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const fullName=u=>(u.first+" "+u.last).trim();
const byRoll=(a,b)=>String(a.roll).localeCompare(String(b.roll),undefined,{numeric:true});
function normPhone(s){
  const m=String(s||"").replace(/[\s\-()]/g,"").match(/^(?:\+?254|0)([17]\d{8})$/);
  if(!m)return null;
  const d="0"+m[1];return d.slice(0,4)+" "+d.slice(4,7)+" "+d.slice(7);
}
function fnv(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return"fnv1:"+(h>>>0).toString(16)+":"+s.length}
async function sha(msg){
  if(HAS_SUBTLE){try{const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(msg));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}catch(e){}}
  return fnv(msg);
}
/* No salt reproduces the pre-fix format so existing records still verify. Never stores a recoverable password. */
const hash=(pw,salt)=>sha("schoolhouse:"+(salt?salt+":":"")+pw);
const rndHex=n=>{const a=new Uint8Array(n);if(HAS_SUBTLE)crypto.getRandomValues(a);else for(let i=0;i<n;i++)a[i]=Math.floor(Math.random()*256);return[...a].map(x=>x.toString(16).padStart(2,"0")).join("")};
async function makePw(pw){const psalt=rndHex(8);return{pw:await hash(pw,psalt),psalt}}
const checkPw=(u,pw)=>hash(pw,u.psalt||"").then(h=>h===u.pw);
function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
const layerEl=()=>{let l=$("#layer");if(!l){l=document.createElement("div");l.id="layer";l.className="layer";document.body.appendChild(l)}return l};
function askConfirm(msg,yesLabel,fn){
  layerEl().innerHTML=`<div class="confirm" role="dialog" aria-modal="true"><div class="card"><h3>${esc(msg)}</h3><div class="row"><button class="btn" data-act="cancel">Cancel</button><button class="btn bad" data-act="yes">${esc(yesLabel)}</button></div></div></div>`;
  UI.confirmFn=fn; setTimeout(()=>{const b=layerEl().querySelector("[data-act=cancel]");b&&b.focus()},0);
}
function closeLayer(){layerEl().innerHTML="";UI.confirmFn=null}
function copyText(text){
  try{navigator.clipboard.writeText(text).then(()=>toast("Copied"),()=>toast("Copy is blocked here. Select the text instead."))}
  catch(e){toast("Copy is blocked here. Select the text instead.")}
}
const S=()=>DB.settings;
const termLabel=(t=S().term,y=S().year)=>`Term ${t}, ${y}`;
const users=(role,approved)=>DB.users.filter(u=>u.role===role&&!u.archived&&(approved===undefined||u.approved===approved));
const byId=id=>DB.users.find(u=>u.id===id);
const subjectsFor=cl=>S().subjects[grpOf(cl)]||[];
/* fees: each student has a fee per term; payments belong to the term of the date they were paid */
const paidOf=(id,t=S().term,y=S().year)=>DB.payments.filter(p=>p.sid===id&&p.term===t&&p.year===y).reduce((x,p)=>x+p.amount,0);
const balOf=(u,t=S().term,y=S().year)=>Math.max(0,(Number(u.fee)||0)-paidOf(u.id,t,y));
const feeState=u=>{const f=Number(u.fee)||0,p=paidOf(u.id);return f===0||p>=f?["Cleared","good"]:p>0?["Partly paid","warn"]:["Unpaid","bad"]};
const feePill=u=>{const [t,c]=feeState(u);return `<span class="pill ${c}">${t}</span>`};
function go(name,p={}){V={name,...p};render();window.scrollTo(0,0)}

/* keep typed answers when a control only changes what is displayed */
const cssSafe=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,"\\$&");
function draftGet(){
  const d={};
  for(const el of document.querySelectorAll("#app [name]")){
    if(el.type==="password"||el.disabled)continue;
    if(el.type==="radio"){if(el.checked)d[el.name]=el.value;continue}
    if(el.type==="checkbox"){d[el.name]=el.checked;continue}
    d[el.name]=el.value;
  }
  return d;
}
function draftSet(d){
  for(const [name,val] of Object.entries(d)){
    const els=[...document.querySelectorAll(`#app [name="${cssSafe(name)}"]`)];
    if(!els.length)continue;
    for(const el of els){
      if(el.type==="radio")el.checked=(el.value===val);
      else if(el.type==="checkbox")el.checked=!!val;
      else el.value=val;
    }
  }
}

/* ---------- data: seed and upgrade ---------- */
function defaultSettings(){
  const n=new Date();
  return{school:"Sunrise Academy",year:n.getFullYear(),term:termForDate(n),subjects:JSON.parse(JSON.stringify(DEFAULT_SUBJECTS))};
}
function migrate(){
  DB.settings=Object.assign(defaultSettings(),DB.settings||{});
  DB.settings.subjects=Object.assign(JSON.parse(JSON.stringify(DEFAULT_SUBJECTS)),DB.settings.subjects||{});
  DB.payments=DB.payments||[];DB.marks=DB.marks||[];DB.attendance=DB.attendance||[];
  const old={one:"Grade 1",two:"Grade 2",three:"Grade 3",four:"Grade 4",five:"Grade 5",six:"Grade 6",seven:"Grade 7",eight:"Grade 8",nine:"Grade 9",ten:"Grade 10"};
  DB.users.forEach(u=>{if(u.role==="student"){if(old[u.cl])u.cl=old[u.cl];u.guardian=u.guardian||"";u.gender=u.gender||"";}});
  DB.attendance.forEach(a=>{if(old[a.cl])a.cl=old[a.cl]});
  DB.marks.forEach(m=>{if(m.absent)m.score=null});
  DB.rcpt=DB.rcpt||0;
  DB.payments.forEach(p=>{
    if(!p.term){p.term=S().term;p.year=S().year}
    if(!p.method){p.method="Cash";p.ref=p.ref||p.note||""}
    if(!p.rcpt){DB.rcpt++;p.rcpt="RCT-"+String(DB.rcpt).padStart(4,"0")}
  });
}
async function seed(){
  const h=await makePw("demo1234"), ha=await makePw("admin123");
  const t=today(), mk=o=>({id:uid(),joined:t,approved:true,mobile:"",...o});
  DB={settings:defaultSettings(),users:[
    mk({role:"admin",username:"admin",pw:ha.pw,psalt:ha.psalt,first:"Amina",last:"Otieno"}),
    mk({role:"teacher",username:"jkamau",pw:h.pw,psalt:h.psalt,first:"John",last:"Kamau",mobile:"0712 345 678",tsc:"412345",salary:48000}),
    mk({role:"teacher",username:"lwanjiru",pw:h.pw,psalt:h.psalt,first:"Lucy",last:"Wanjiru",mobile:"0723 456 789",tsc:"398210",salary:52000}),
    mk({role:"teacher",username:"pnjoroge",pw:h.pw,psalt:h.psalt,first:"Peter",last:"Njoroge",mobile:"0734 567 890",tsc:"",salary:45000,approved:false}),
    mk({role:"student",username:"asha",pw:h.pw,psalt:h.psalt,first:"Asha",last:"Mwangi",roll:"1041",cl:"Grade 4",gender:"Female",fee:15000,guardian:"Grace Mwangi",mobile:"0745 111 222"}),
    mk({role:"student",username:"brian",pw:h.pw,psalt:h.psalt,first:"Brian",last:"Ochieng",roll:"1042",cl:"Grade 4",gender:"Male",fee:15000,guardian:"James Ochieng",mobile:"0745 111 333"}),
    mk({role:"student",username:"cynthia",pw:h.pw,psalt:h.psalt,first:"Cynthia",last:"Achieng",roll:"1043",cl:"Grade 4",gender:"Female",fee:15000,guardian:"Rose Achieng",mobile:"0745 111 444"}),
    mk({role:"student",username:"daniel",pw:h.pw,psalt:h.psalt,first:"Daniel",last:"Kiptoo",roll:"1051",cl:"Grade 5",gender:"Male",fee:16000,guardian:"Hillary Kiptoo",mobile:"0745 222 111"}),
    mk({role:"student",username:"esther",pw:h.pw,psalt:h.psalt,first:"Esther",last:"Muthoni",roll:"1052",cl:"Grade 5",gender:"Female",fee:16000,guardian:"Mary Muthoni",mobile:"0745 222 222"}),
    mk({role:"student",username:"farid",pw:h.pw,psalt:h.psalt,first:"Farid",last:"Hassan",roll:"1071",cl:"Grade 7",gender:"Male",fee:22000,guardian:"Amina Hassan",mobile:"0745 333 111",approved:false}),
  ],attendance:[],notices:[],messages:[],payments:[],marks:[],rcpt:0};
  const U=n=>DB.users.find(u=>u.username===n);
  const {term,year}=S();
  const st=users("student",true).filter(s=>s.cl==="Grade 4");
  for(let i=1;i<=4;i++){const d=new Date();d.setDate(d.getDate()-i);if(d.getDay()===0||d.getDay()===6)continue;
    st.forEach((s,k)=>DB.attendance.push({date:ymd(d),cl:"Grade 4",sid:s.id,status:(i+k)%4===0?"Absent":"Present"}))}
  DB.notices.push({id:uid(),date:t,by:"Amina",message:`Welcome to Term ${term}. Pay fees by M-Pesa and use the admission number as the account number. Mid-term exams start next week.`});
  const pay=(un,amount,date,method,ref)=>{const st=stampOf(date);DB.rcpt++;DB.payments.push({id:uid(),sid:U(un).id,amount,date,method,ref,term:st.term,year:st.year,rcpt:"RCT-"+String(DB.rcpt).padStart(4,"0")})};
  pay("asha",5000,dAgo(20),"M-Pesa","SJK4X9P2QA");
  pay("brian",15000,dAgo(15),"M-Pesa","SJL7M2R8TB");
  pay("daniel",8000,dAgo(9),"Bank deposit","SLIP-88213");
  pay("daniel",4000,dAgo(2),"Cash","");
  const scores={asha:[82,76,91,68,74,80,88,79],brian:[64,58,72,60,55,63,70,66],cynthia:[47,52,39,44,50,41,58,45]};
  const subs=DEFAULT_SUBJECTS.upper;
  Object.entries(scores).forEach(([un,arr])=>arr.forEach((score,i)=>DB.marks.push({sid:U(un).id,term,year,exam:"Mid-term",subject:subs[i],score,absent:false})));
  save();
}

/* ---------- public views ---------- */
const brandName=()=>esc(S().school);
function publicShell(inner){
  return `<div class="wrap">
  <header class="top"><button class="brand" data-go="home"><i></i>${brandName()}</button>
  <nav class="nav" aria-label="Main">
   ${[["home","Home"],["portal:admin","Admin"],["portal:teacher","Teacher"],["portal:student","Student"],["about","About"],["contact","Contact"]].map(([k,l])=>`<button data-go="${k}" class="${(V.name===k||(k.startsWith("portal")&&V.role===k.split(":")[1]&&V.name===k.slice(7)))?"on":""}">${l}</button>`).join("")}
  </nav></header>${inner}
  <footer class="foot"><span>Demo build. Records are saved in this browser only.</span><button class="btn sm ghost" data-act="reset">Reset demo data</button></footer></div>`;
}
function vHome(){
  return publicShell(`
  <section class="hero"><div>
   <h1>${brandName()}: admissions, exams and fees in one place.</h1>
   <p class="lead">Made for Kenyan schools. Registers from PP1 to Grade 12 and Forms 3 and 4, CBC and KCSE grading, fees in KSh with M-Pesa references, and a report card for every learner.</p>
   <div class="cta"><button class="btn primary" data-go="signup:student">Take admission</button><button class="btn" data-go="signup:teacher">Apply to teach</button></div></div>
   <div class="board" aria-hidden="true"><h3>On the board this term</h3><ul>
    <li><b>EE</b>CBC levels EE1 to BE2 and KCSE grades A to E</li><li><b>T1</b>Three terms a year, with fees reset each term</li><li><b>M</b>M-Pesa codes recorded on every payment</li><li><b>RC</b>Report cards with position and remarks</li></ul></div>
  </section>
  <section class="portals">
   ${["admin","teacher","student"].map(r=>`<div class="portal"><h2>${cap(r)}</h2><p>${{admin:"Approve applications, manage people, record fees and salaries, enter exams, post notices and set the term.",teacher:"Take attendance, enter exam marks for any class and post notices.",student:"See your fee balance, attendance and report card, and read the notice board."}[r]}</p><div class="row"><button class="btn primary" data-go="login:${r}">Log in</button><button class="btn" data-go="signup:${r}">Sign up</button></div></div>`).join("")}
  </section>`);
}
function vAbout(){return publicShell(`<div class="formcard card" style="max-width:720px"><h1 style="font-size:32px">About ${brandName()}</h1><p class="muted" style="margin-top:14px;max-width:62ch">Learners and teachers apply online and an administrator approves them. Each role then sees only its own tools. Attendance is taken per class per day. Marks are graded with the CBC levels for Grade 12 and below, and with KCSE grades for Forms 3 and 4. Fees are charged per term and paid by M-Pesa, cash, bank or cheque, and every payment gets a receipt number.</p></div>`)}
function vContact(){
  return publicShell(`<div class="formcard card"><h1 style="font-size:32px">Contact us</h1>
  ${UI.sent?`<p class="demo" style="margin-top:16px">Thanks. Your message is saved and the office will see it on the admin dashboard.</p>`:""}
  <form class="form" data-form="contact" novalidate>
   <label class="f">Name<input id="c_name" name="name" required maxlength="30"></label>
   <label class="f">Email<input id="c_email" name="email" type="email" required></label>
   <label class="f">Message<textarea id="c_msg" name="message" rows="4" maxlength="500" required></textarea></label>
   <div class="err" id="ferr" hidden></div><button class="btn primary">Send message</button></form></div>`);
}
function classOptions(sel){
  return Object.entries(GROUPS).map(([g,label])=>`<optgroup label="${esc(label)}">${LEVELS.filter(c=>grpOf(c)===g).map(c=>`<option value="${c}" ${sel===c?"selected":""}>${c}</option>`).join("")}</optgroup>`).join("");
}
function personFields(role,u={},edit=false){
  const s=role==="student";
  return `<div class="grid2">
   <label class="f">First name<input id="f_first" name="first" value="${esc(u.first)}" required></label>
   <label class="f">Last name<input id="f_last" name="last" value="${esc(u.last)}" required></label></div>
   <label class="f">Username <span class="hint">3 to 20 letters, numbers, dot, dash or underscore</span><input id="f_username" name="username" value="${esc(u.username)}" autocomplete="username" required></label>
   <label class="f">Password${edit?` <span class="hint">leave blank to keep the current one</span>`:""}<input id="f_pw" name="pw" type="password" autocomplete="new-password" ${edit?"":"required minlength=6"}></label>
   ${s?`<div class="grid2"><label class="f">Admission number<input id="f_roll" name="roll" value="${esc(u.roll)}" required maxlength="10"></label>
     <label class="f">Gender<select id="f_gender" name="gender"><option value="Female" ${u.gender==="Female"?"selected":""}>Female</option><option value="Male" ${u.gender==="Male"?"selected":""}>Male</option></select></label></div>
   <div class="grid2"><label class="f">Class<select id="f_cl" name="cl">${classOptions(u.cl||"Grade 1")}</select></label>
     <label class="f">Fee per term (KSh)<input id="f_fee" name="fee" type="number" min="0" value="${esc(u.fee)}" required></label></div>
   <div class="grid2"><label class="f">Parent or guardian<input id="f_guardian" name="guardian" value="${esc(u.guardian)}" required></label>
     <label class="f">Guardian phone <span class="hint">07xx or 01xx</span><input id="f_mobile" name="mobile" value="${esc(u.mobile)}" inputmode="tel" placeholder="0712 345 678" required></label></div>`
   :`<div class="grid2"><label class="f">Mobile <span class="hint">07xx or 01xx</span><input id="f_mobile" name="mobile" value="${esc(u.mobile)}" inputmode="tel" placeholder="0712 345 678" required></label>
     <label class="f">TSC number <span class="hint">optional</span><input id="f_tsc" name="tsc" value="${esc(u.tsc)}" maxlength="12"></label></div>
   <label class="f">Salary per month (KSh)<input id="f_salary" name="salary" type="number" min="0" value="${esc(u.salary)}" required></label>`}`;
}
function vSignup(){
  const r=V.role;
  if(r==="admin"&&users("admin").length>0)return publicShell(`<div class="formcard card"><h1 style="font-size:30px">Admin accounts are invitation only</h1><p class="muted" style="margin-top:12px">An existing administrator adds new admins from inside the Admin portal.</p><div style="margin-top:18px"><button class="btn primary" data-go="login:admin">Admin log in</button></div></div>`);
  const body=r==="admin"?`<div class="grid2"><label class="f">First name<input id="f_first" name="first" required></label><label class="f">Last name<input id="f_last" name="last" required></label></div>
   <label class="f">Username<input id="f_username" name="username" required autocomplete="username"></label>
   <label class="f">Password<input id="f_pw" name="pw" type="password" minlength="6" required autocomplete="new-password"></label>`:personFields(r);
  return publicShell(`<div class="formcard card"><h1 style="font-size:30px">${r==="student"?"Take admission":r==="teacher"?"Apply to teach":"Create the first admin"}</h1>
   <p class="muted" style="margin-top:6px">${r==="admin"?"This account is created once. Later admins are added by an existing admin.":"The office approves your account before you can log in."}</p>
   <form class="form" data-form="signup:${r}" novalidate>${body}<div class="err" id="ferr" hidden></div><button class="btn primary">Sign up</button></form>
   <p style="margin-top:14px" class="muted">Already registered? <a href="#" data-go="login:${r}">Log in</a></p></div>`);
}
function vLogin(){
  const r=V.role;
  const demo={admin:["admin","admin123"],teacher:["jkamau","demo1234"],student:["asha","demo1234"]}[r];
  return publicShell(`<div class="formcard card"><h1 style="font-size:30px">${cap(r)} log in</h1>
   <div class="demo" style="margin-top:14px">Demo account: <code>${demo[0]}</code> / <code>${demo[1]}</code> <button class="btn sm" data-act="fill" data-u="${demo[0]}" data-p="${demo[1]}" style="margin-left:6px">Fill in</button></div>
   <form class="form" data-form="login:${r}" novalidate>
    <label class="f">Username<input id="l_u" name="username" autocomplete="username" required></label>
    <label class="f">Password<input id="l_p" name="pw" type="password" autocomplete="current-password" required></label>
    <div class="err" id="ferr" hidden></div><button class="btn primary">Log in</button></form>
   <p style="margin-top:14px" class="muted">New here? <a href="#" data-go="signup:${r}">Sign up</a></p></div>`);
}
function vWait(){
  return publicShell(`<div class="formcard card"><h1 style="font-size:30px">Waiting for approval</h1><p class="muted" style="margin-top:12px">Your ${ME.role} account has been received. An administrator needs to approve it before you can open your dashboard. Try again later.</p><div style="margin-top:18px"><button class="btn" data-act="logout">Log out</button></div></div>`);
}

/* ---------- portal shell ---------- */
const NAV={
 admin:[["dash","Dashboard"],["teachers","Teachers"],["students","Learners"],["attendance","Attendance"],["exams","Exams"],["fees","Fees"],["notices","Notices"],["admins","Admins"],["settings","Settings"],["password","Password"]],
 teacher:[["dash","Dashboard"],["attendance","Attendance"],["exams","Exams"],["notices","Notices"],["password","Password"]],
 student:[["dash","Dashboard"],["myatt","Attendance"],["myreport","Report card"],["password","Password"]]};
function portal(title,sub,inner,actions=""){
  const navKey=V.nav||V.name.split(":")[0];
  return `<div class="shell"><aside class="side"><button class="brand" data-go="dash"><i></i>${brandName()}</button>
   <div class="me"><b>${esc(fullName(ME))}</b><span>${ME.role}</span></div>
   ${NAV[ME.role].map(([k,l])=>`<button class="item ${navKey===k?"on":""}" data-go="${k}">${l}</button>`).join("")}
   <div class="spacer"></div><button class="item" data-act="logout">Log out</button></aside>
   <main class="main"><div class="head"><div><h1 style="font-size:30px">${esc(title)}</h1>${sub?`<p>${esc(sub)}</p>`:""}</div><div>${actions}</div></div>${inner}</main></div>`;
}
const stat=(k,v,s)=>`<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s||"&nbsp;"}</div></div>`;
function noticeList(canDelete){
  const ns=[...DB.notices].sort((a,b)=>b.date.localeCompare(a.date));
  if(!ns.length)return `<div class="empty">No notices yet.</div>`;
  return `<div class="notices">${ns.map(n=>`<div class="notice"><div><small>${fmtDate(n.date)} · by ${esc(n.by)}</small>${esc(n.message)}</div>${canDelete?`<button class="btn sm bad" data-act="delnotice" data-id="${n.id}">Delete</button>`:""}</div>`).join("")}</div>`;
}
function classPicker(next,count){
  return Object.entries(GROUPS).map(([g,label])=>`<h3 style="margin:22px 0 10px" class="muted">${esc(label)}</h3><div class="classes">${LEVELS.filter(c=>grpOf(c)===g).map(c=>`<button data-go="${next}" data-cl="${esc(c)}"><b>${esc(c)}</b><span>${count(c)}</span></button>`).join("")}</div>`).join("");
}
const nStudents=c=>{const n=users("student",true).filter(s=>s.cl===c).length;return n+" learner"+(n===1?"":"s")};

/* ---------- admin ---------- */
function vAdminDash(){
  const T=users("teacher",true),Tp=users("teacher",false),St=users("student",true),Sp=users("student",false);
  const sum=(a,k)=>a.reduce((x,u)=>x+(Number(u[k])||0),0);
  return portal("Dashboard",`${termLabel()} · signed in as ${fullName(ME)}`,`
   <div class="stats">${stat("Teachers",T.length,`${Tp.length} pending`)}${stat("Learners",St.length,`${Sp.length} pending`)}${stat("Salary bill",money(sum(T,"salary")),"per month")}${stat("Fees collected",money(St.reduce((x,s)=>x+paidOf(s.id),0)),`${money(St.reduce((x,s)=>x+balOf(s),0))} outstanding of ${money(sum(St,"fee"))}`)}</div>
   <h2 style="margin-bottom:12px">Notice board</h2>${noticeList(false)}
   ${DB.messages.length?`<h2 style="margin:26px 0 12px">Messages from the contact page</h2><div class="notices">${DB.messages.map(m=>`<div class="notice"><div><small>${fmtDate(m.date)} · ${esc(m.name)} · ${esc(m.email)}</small>${esc(m.message)}</div><button class="btn sm bad" data-act="delmsg" data-id="${m.id}">Dismiss</button></div>`).join("")}</div>`:""}`,"");
}
function vPeople(role){
  const tab=UI[role+"Tab"]||"active", act=users(role,true), pen=users(role,false), stu=role==="student";
  const arch=DB.users.filter(u=>u.role===role&&u.archived);
  const tabs=[["active",`Active (${act.length})`],["pending",`Pending (${pen.length})`],[stu?"fees":"salary",stu?"Fees":"Salaries"]];
  if(arch.length)tabs.push(["archived",`Archived (${arch.length})`]);
  tabs.push(["add",`Add ${stu?"learner":"teacher"}`]);
  let body;
  if(tab==="add")body=`<div class="card" style="max-width:600px"><form class="form" data-form="add:${role}" novalidate style="margin-top:0">${personFields(role)}<div class="err" id="ferr" hidden></div><button class="btn primary">Add ${stu?"learner":"teacher"}</button></form></div>`;
  else if(tab==="pending")body=userTable(role,pen,"pending");
  else if(tab==="fees")body=feeTable(act);
  else if(tab==="salary")body=userTable(role,act,"salary");
  else if(tab==="archived")body=userTable(role,arch,"archived");
  else body=userTable(role,act,"active");
  return portal(stu?"Learners":"Teachers",stu?"Admissions, class lists and fees":"Staff, approvals and salaries",
   `<div class="seg" role="tablist">${tabs.map(([k,l])=>`<button role="tab" aria-selected="${tab===k}" class="${tab===k?"on":""}" data-act="tab" data-role="${role}" data-tab="${k}">${l}</button>`).join("")}</div>${body}`);
}
function userTable(role,list,mode){
  if(!list.length)return `<div class="empty">${mode==="pending"?`No pending ${role} applications.`:mode==="archived"?`No archived ${role}s.`:`No ${role}s yet.`}</div>`;
  const stu=role==="student";
  const cols=stu?[["Name",u=>esc(fullName(u))],["Adm. no.",u=>`<span class="mono">${esc(u.roll)}</span>`],["Class",u=>esc(u.cl)],["Parent or guardian",u=>`${esc(u.guardian)}<div class="muted mono">${esc(u.mobile)}</div>`],["Fee per term",u=>money(u.fee),1]]
    :[["Name",u=>esc(fullName(u))],["TSC no.",u=>esc(u.tsc)||"—"],["Mobile",u=>esc(u.mobile)],["Joined",u=>fmtDate(u.joined)],["Salary per month",u=>money(u.salary),1]];
  const key=stu?"fee":"salary", total=list.reduce((x,u)=>x+(Number(u[key])||0),0);
  const showAct=mode!=="salary";
  const rows=list.map(u=>`<tr>${cols.map(c=>`<td class="${c[2]?"r num":""}">${c[1](u)}</td>`).join("")}${showAct?`<td><div style="display:flex;gap:6px;justify-content:flex-end">${mode==="pending"?`<button class="btn sm good" data-act="approve" data-id="${u.id}">Approve</button><button class="btn sm bad" data-act="remove" data-id="${u.id}" data-ctx="reject">Reject</button>`:mode==="archived"?`<button class="btn sm good" data-act="restore" data-id="${u.id}">Restore</button><button class="btn sm bad" data-act="remove" data-id="${u.id}" data-ctx="purge">Delete permanently</button>`:`<button class="btn sm" data-act="edit" data-id="${u.id}">Edit</button><button class="btn sm bad" data-act="remove" data-id="${u.id}" data-ctx="remove">${stu?"Remove":"Remove"}</button>`}</div></td>`:""}</tr>`).join("");
  return `<div class="tablewrap"><table style="min-width:640px"><thead><tr>${cols.map(c=>`<th class="${c[2]?"r":""}">${c[0]}</th>`).join("")}${showAct?"<th></th>":""}</tr></thead><tbody>${rows}</tbody>
   ${mode!=="pending"?`<tfoot><tr><td colspan="${cols.length-1}">Total</td><td class="r num">${money(total)}</td>${showAct?"<td></td>":""}</tr></tfoot>`:""}</table></div>`;
}
function vEdit(){
  const u=byId(V.id); if(!u)return vAdminDash();
  return portal(`Edit ${u.first}`,"Leave the password blank to keep it unchanged.",
   `<div class="card" style="max-width:600px"><form class="form" data-form="edit:${u.id}" novalidate style="margin-top:0">${personFields(u.role,u,true)}<div class="err" id="ferr" hidden></div><div style="display:flex;gap:8px"><button class="btn primary">Save changes</button><button type="button" class="btn" data-act="canceledit" data-role="${u.role}">Cancel</button></div></form></div>`);
}

/* attendance */
function vAttendance(){
  if(!V.cl)return portal("Attendance","Pick a class to take or review its register",classPicker("attendance",nStudents));
  const cl=V.cl, st=users("student",true).filter(s=>s.cl===cl).sort(byRoll);
  const mode=UI.attMode||"take", date=UI.attDate||today();
  const existing=new Map(DB.attendance.filter(a=>a.cl===cl&&a.date===date).map(a=>[a.sid,a.status]));
  let body;
  if(!st.length)body=`<div class="empty">No approved learners in ${esc(cl)} yet.</div>`;
  else if(mode==="take"){
    body=`<form data-form="takeatt" novalidate><div class="bar"><label class="f">Date<input id="a_date" type="date" name="date" value="${date}" max="${today()}" required></label>
    <button type="button" class="btn sm" data-act="allp">Mark all present</button>${existing.size?`<span class="pill warn">Register exists for this date. Saving replaces it.</span>`:""}</div>
    <div class="tablewrap"><table><thead><tr><th>Adm. no.</th><th>Name</th><th>Status</th></tr></thead><tbody>${st.map(s=>{const v=existing.get(s.id)||"Present";return `<tr><td class="mono">${esc(s.roll)}</td><td>${esc(fullName(s))}</td><td><div class="radios"><label><input type="radio" name="s_${s.id}" value="Present" ${v==="Present"?"checked":""}><span class="p">Present</span></label><label><input type="radio" name="s_${s.id}" value="Absent" ${v==="Absent"?"checked":""}><span class="a">Absent</span></label></div></td></tr>`}).join("")}</tbody></table></div>
    <div style="margin-top:14px"><button class="btn primary">Save register</button></div></form>`;
  }else{
    const rows=st.map(s=>{const v=existing.get(s.id);return `<tr><td class="mono">${esc(s.roll)}</td><td>${esc(fullName(s))}</td><td>${v?`<span class="pill ${v==="Present"?"good":"bad"}">${v}</span>`:`<span class="pill warn">Not taken</span>`}</td></tr>`}).join("");
    body=`<div class="bar"><label class="f">Date<input id="a_date" type="date" value="${date}" max="${today()}" data-act="datechg"></label></div>
    <div class="tablewrap"><table><thead><tr><th>Adm. no.</th><th>Name</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  return portal(cl,`${st.length} learner${st.length===1?"":"s"}`,
   `<div class="seg"><button class="${mode==="take"?"on":""}" data-act="attmode" data-m="take">Take attendance</button><button class="${mode==="view"?"on":""}" data-act="attmode" data-m="view">View attendance</button></div>${body}`,
   `<button class="btn" data-go="attendance">All classes</button>`);
}

/* exams and report cards */
function classResults(cl,exam){
  const {term,year}=S(), offered=subjectsFor(cl).length;
  const rows=users("student",true).filter(s=>s.cl===cl).sort(byRoll).map(s=>{
    const ms=DB.marks.filter(m=>m.sid===s.id&&m.exam===exam&&m.term===term&&m.year===year);
    const live=ms.filter(m=>!m.absent&&m.score!=null);
    const absent=ms.filter(m=>m.absent||m.score==null).length;
    const total=live.reduce((x,m)=>x+m.score,0);
    const sat=live.length, expected=Math.max(0,offered-absent);
    return{s,ms,total,sat,absent,offered,expected,n:sat,complete:sat>0&&sat===expected,mean:sat?total/sat:null};
  });
  const ranked=rows.filter(r=>r.complete).sort((a,b)=>b.total-a.total);
  ranked.forEach((r,i)=>{r.pos=i>0&&r.total===ranked[i-1].total?ranked[i-1].pos:i+1});
  return{rows,count:ranked.length,offered};
}
const examBar=()=>`<div class="bar"><label class="f">Exam<select id="exam_sel" data-act="examchg">${EXAMS.map(x=>`<option ${x===(UI.exam||"Mid-term")?"selected":""}>${x}</option>`).join("")}</select></label><span class="pill warn" style="align-self:center">${termLabel()}</span></div>`;
function vExams(){
  if(!V.cl)return portal("Exams","Enter marks and see results for the current term",classPicker("exams",nStudents));
  const cl=V.cl, subs=subjectsFor(cl), exam=UI.exam||"Mid-term", mode=UI.examMode||"results";
  const res=classResults(cl,exam), st=res.rows;
  let body;
  if(!st.length)body=`<div class="empty">No approved learners in ${esc(cl)} yet.</div>`;
  else if(mode==="enter"){
    body=`<form data-form="marks" novalidate><p class="muted" style="margin-bottom:12px">Marks are out of 100. Type <b>A</b> for a learner who did not sit that paper. Leave a box empty only if the mark is still pending.</p>
    <div class="tablewrap marks"><table style="min-width:${180+subs.length*100}px"><thead><tr><th>Adm. no.</th><th>Name</th>${subs.map(x=>`<th class="r">${esc(x)}</th>`).join("")}</tr></thead><tbody>
    ${st.map(r=>`<tr><td class="mono">${esc(r.s.roll)}</td><td>${esc(fullName(r.s))}</td>${subs.map((x,i)=>{const m=r.ms.find(k=>k.subject===x);const v=m?(m.absent?"A":m.score):"";return `<td class="r"><input type="text" pattern="[0-9]*\\.?[0-9]*|[Aa]" maxlength="6" inputmode="decimal" name="m_${r.s.id}_${i}" aria-label="${esc(x)} for ${esc(fullName(r.s))}" value="${esc(v)}"></td>`}).join("")}</tr>`).join("")}</tbody></table></div>
    <div class="err" id="ferr" hidden style="margin-top:12px"></div><div style="margin-top:14px"><button class="btn primary">Save marks</button></div></form>`;
  }else{
    const ranked=st.filter(r=>r.complete).sort((a,b)=>a.pos-b.pos);
    const partial=st.filter(r=>!r.complete&&r.sat>0);
    const none=st.filter(r=>r.sat===0);
    const line=(r,tag)=>{const gr=r.sat?gradeOf(cl,r.mean):null;return `<tr><td class="num">${r.pos||"—"}</td><td class="mono">${esc(r.s.roll)}</td><td>${esc(fullName(r.s))}</td><td class="num">${r.sat}/${r.offered}</td><td class="r num">${r.sat?r.total:"—"}</td><td class="r num">${r.sat?r.mean.toFixed(1):"—"}</td><td>${gr?gradePill(gr.g):`<span class="pill warn">No marks</span>`}</td><td>${tag||""}</td><td><div style="display:flex;justify-content:flex-end"><button class="btn sm" data-act="report" data-id="${r.s.id}">Report card</button></div></td></tr>`};
    body=`<p class="muted" style="margin-bottom:10px">Mean is over the papers a learner actually sat. Position ranks only learners who sat every paper they were expected to.</p>
    <div class="tablewrap"><table style="min-width:720px"><thead><tr><th>Pos.</th><th>Adm. no.</th><th>Name</th><th>Papers</th><th class="r">Total</th><th class="r">Mean</th><th>${grpOf(cl)==="form"?"Grade":"Level"}</th><th></th><th></th></tr></thead><tbody>
    ${ranked.map(r=>line(r)).join("")}${partial.map(r=>line(r,`<span class="pill warn">Partial · ${r.absent?"absent":"marks pending"}</span>`)).join("")}${none.map(r=>line(r)).join("")}</tbody></table></div>`;
  }
  return portal(cl,`${subs.length} subjects · ${st.length} learner${st.length===1?"":"s"}`,
   `<div class="seg"><button class="${mode==="results"?"on":""}" data-act="exammode" data-m="results">Results</button><button class="${mode==="enter"?"on":""}" data-act="exammode" data-m="enter">Enter marks</button></div>${examBar()}${body}`,
   `<button class="btn" data-go="exams">All classes</button>`);
}
function reportCard(s){
  const exam=UI.exam||"Mid-term", {term,year}=S();
  const res=classResults(s.cl,exam), subs=subjectsFor(s.cl);
  const row=res.rows.find(r=>r.s.id===s.id)||{ms:[],total:0,sat:0,absent:0,n:0,mean:null,complete:false,offered:res.offered,expected:res.offered};
  const by=new Map(row.ms.map(m=>[m.subject,m]));
  const older=row.ms.map(m=>m.subject).filter(x=>!subs.includes(x));
  const list=[...subs,...older];
  const form=grpOf(s.cl)==="form";
  const [m1,m2]=TERM_MONTHS[term], att=DB.attendance.filter(a=>a.sid===s.id&&a.date>=`${year}-${pad(m1)}-01`&&a.date<=`${year}-${pad(m2)}-31`);
  const pres=att.filter(a=>a.status==="Present").length;
  const head=`<div class="rc"><header><div><h2>${brandName()}</h2><div class="muted">Learner report · ${esc(exam)} exam</div></div><div class="muted" style="text-align:right">${termLabel()}</div></header>
   <div class="meta"><div><small>Name</small>${esc(fullName(s))}</div><div><small>Admission no.</small><span class="mono">${esc(s.roll)}</span></div><div><small>Class</small>${esc(s.cl)}</div><div><small>Papers sat</small>${row.sat} of ${row.offered}</div><div><small>Parent or guardian</small>${esc(s.guardian)||"—"}</div></div>`;
  if(!row.sat)return head+`<div class="empty">No marks have been entered for ${esc(exam)} in ${termLabel()}.</div></div>`;
  const gr=gradeOf(s.cl,row.mean);
  const rankNote=row.complete?`${row.pos} of ${res.count}`:"Not ranked";
  const rows=list.map(x=>{
    const m=by.get(x);
    if(!m)return `<tr><td>${esc(x)}</td><td class="r muted">Pending</td><td>—</td><td class="r num">—</td>${form?"":`<td class="muted">Not entered</td>`}</tr>`;
    if(m.absent)return `<tr><td>${esc(x)}</td><td class="r"><span class="pill warn">Absent</span></td><td>—</td><td class="r num">—</td>${form?"":`<td class="muted">Did not sit</td>`}</tr>`;
    const g=gradeOf(s.cl,m.score);
    return `<tr><td>${esc(x)}</td><td class="r num">${m.score}</td><td>${gradePill(g.g)}</td><td class="r num">${g.pts}</td>${form?"":`<td class="muted">${gradeWord(g.g)}</td>`}</tr>`;
  }).join("");
  const olderNote=older.length?`<p class="muted" style="margin-top:10px">Older subjects: ${esc(older.join(", "))}. These names are no longer in the subject list for ${esc(s.cl)}.</p>`:"";
  const text=`${S().school}\n${fullName(s)} (Adm ${s.roll}), ${s.cl}\n${exam}, ${termLabel()}\n`+list.map(x=>{const m=by.get(x);return m?`${x}: ${m.absent?"ABSENT":m.score} ${m.absent?"":gradeOf(s.cl,m.score).g}`:`${x}: pending`}).join("\n")+`\nTotal ${row.total}, mean ${row.mean.toFixed(1)} (${gr.g}) over ${row.sat} of ${row.offered} papers, position ${row.complete?row.pos+" of "+res.count:"not ranked"}`;
  UI.reportText=text;
  return head+`<div class="tablewrap" style="border-radius:8px"><table style="min-width:${form?420:560}px"><thead><tr><th>Subject</th><th class="r">Score</th><th>${form?"Grade":"Level"}</th><th class="r">Points</th>${form?"":"<th>Meaning</th>"}</tr></thead><tbody>${rows}</tbody></table></div>${olderNote}
   ${row.complete?"":`<div class="err" style="margin-top:12px">This learner sat ${row.sat} of ${row.offered} papers, so the mean covers those papers only and no position is awarded.</div>`}
   <div class="sum"><div><small class="muted">Total</small><b class="num">${row.total}</b></div><div><small class="muted">Mean score</small><b class="num">${row.mean.toFixed(1)}</b></div><div><small class="muted">Overall</small><b>${gr.g}</b></div><div><small class="muted">Position</small><b class="num">${rankNote}</b></div><div><small class="muted">Attendance</small><b class="num">${att.length?Math.round(pres/att.length*100)+"%":"—"}</b></div><div><small class="muted">Fee balance</small><b class="num">${money(balOf(s))}</b></div></div>
   <div class="remark"><b>Remarks:</b> ${remark(s.cl,row.mean)}</div></div>`;
}
function vReport(){
  const s=byId(V.id); if(!s)return vExams();
  return portal("Report card",`${fullName(s)} · ${s.cl}`,`${examBar()}${reportCard(s)}<div style="margin-top:14px"><button class="btn" data-act="copyreport">Copy as text</button><button class="btn" data-act="print">Print</button></div>`,
   `<button class="btn" data-act="reportback">Back to results</button>`);
}
function vMyReport(){
  return portal("Report card",`${ME.cl} · ${termLabel()}`,`${examBar()}${reportCard(ME)}<div style="margin-top:14px"><button class="btn" data-act="copyreport">Copy as text</button><button class="btn" data-act="print">Print</button></div>`);
}

/* fees */
function vFees(){
  if(!V.cl)return portal("Fees",`Fees by class for ${termLabel()}`,classPicker("fees",c=>{const l=users("student",true).filter(s=>s.cl===c);return money(l.reduce((x,s)=>x+balOf(s),0))+" owed"}));
  const l=users("student",true).filter(s=>s.cl===V.cl);
  return portal(`${V.cl} fees`,termLabel(),feeTable(l),`<button class="btn" data-go="fees">All classes</button>`);
}
function feeTable(list){
  if(!list.length)return `<div class="empty">No learners here yet.</div>`;
  const tf=list.reduce((x,u)=>x+(Number(u.fee)||0),0),tp=list.reduce((x,u)=>x+paidOf(u.id),0),tb=list.reduce((x,u)=>x+balOf(u),0);
  const rows=list.map(u=>`<tr><td>${esc(fullName(u))}</td><td class="mono">${esc(u.roll)}</td><td>${esc(u.cl)}</td><td class="r num">${money(u.fee)}</td><td class="r num">${money(paidOf(u.id))}</td><td class="r num"><b>${money(balOf(u))}</b></td><td>${feePill(u)}</td><td><div style="display:flex;justify-content:flex-end"><button class="btn sm primary" data-act="pay" data-id="${u.id}">Payments</button></div></td></tr>`).join("");
  return `<p class="muted" style="margin-bottom:10px">Balances are for ${termLabel()}.</p><div class="tablewrap"><table style="min-width:780px"><thead><tr><th>Name</th><th>Adm. no.</th><th>Class</th><th class="r">Fee</th><th class="r">Paid</th><th class="r">Balance</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">Total</td><td class="r num">${money(tf)}</td><td class="r num">${money(tp)}</td><td class="r num">${money(tb)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
}
function vPay(){
  const u=byId(V.id); if(!u)return vAdminDash();
  const ps=DB.payments.filter(p=>p.sid===u.id).sort((a,b)=>b.date.localeCompare(a.date)||b.rcpt.localeCompare(a.rcpt));
  const date=UI.payDate||today(), stamp=stampOf(date), cur=stamp.term===S().term&&stamp.year===S().year;
  const bal=balOf(u,stamp.term,stamp.year), meth=UI.method||"M-Pesa";
  const posts=`<span class="pill ${cur?"warn":""}" style="align-self:center">Posts to Term ${stamp.term}, ${stamp.year}${cur?"":" · does not change the current balance"}</span>`;
  const form=bal>0?`<div class="card" style="max-width:640px;margin-bottom:24px"><h3>Record a payment</h3><form class="form" data-form="pay:${u.id}" novalidate>
    <div class="grid2"><label class="f">Amount (KSh)<input id="p_amt" name="amount" type="number" min="1" max="${bal}" step="1" inputmode="numeric" placeholder="Up to ${bal.toLocaleString("en-KE")}" required></label>
    <label class="f">Date paid <span class="hint">decides the term</span><input id="p_date" name="date" type="date" value="${date}" max="${today()}" required data-act="paydatechg"></label></div>
    <div class="bar" style="padding:0 0 6px">${posts}</div>
    <div class="grid2"><label class="f">Method<select id="p_method" name="method" data-act="methodchg">${METHODS.map(m=>`<option ${m===meth?"selected":""}>${m}</option>`).join("")}</select></label>
    <label class="f">${meth==="M-Pesa"?"M-Pesa code":meth==="Bank deposit"?"Bank slip number":meth==="Cheque"?"Cheque number":"Reference"} <span class="hint">${meth==="M-Pesa"?"10 characters, required":"optional"}</span><input id="p_ref" name="ref" maxlength="20" ${meth==="M-Pesa"?'placeholder="SJK4X9P2QA" style="text-transform:uppercase"':""}></label></div>
    <div class="err" id="ferr" hidden></div><div><button class="btn primary">Save payment</button></div></form></div>`
    :`<div class="demo" style="max-width:600px;margin-bottom:24px;background:var(--good-bg);color:var(--good)">Term ${stamp.term}, ${stamp.year} is fully paid for ${esc(fullName(u))}.</div>`;
  const table=ps.length?`<div class="tablewrap"><table style="min-width:660px"><thead><tr><th>Receipt</th><th>Date</th><th>Term</th><th>Method</th><th>Reference</th><th class="r">Amount</th><th></th></tr></thead><tbody>${ps.map(p=>`<tr><td class="mono">${esc(p.rcpt)}</td><td>${fmtDate(p.date)}</td><td>T${p.term} ${p.year}</td><td>${esc(p.method)}</td><td class="mono">${esc(p.ref)||"—"}</td><td class="r num">${money(p.amount)}</td><td><div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn sm" data-act="receipt" data-id="${p.id}">Receipt</button><button class="btn sm bad" data-act="delpay" data-id="${p.id}">Delete</button></div></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No payments recorded for ${esc(u.first)} yet.</div>`;
  return portal(fullName(u),`Adm. ${u.roll} · ${u.cl} · guardian ${u.guardian||"—"} ${u.mobile}`,
   `<div class="stats">${stat("Fee per term",money(u.fee))}${stat(`Paid in Term ${stamp.term}`,money(paidOf(u.id,stamp.term,stamp.year)),Number(u.fee)?Math.round(paidOf(u.id,stamp.term,stamp.year)/u.fee*100)+"% of the fee":"")}${stat("Balance for that term",money(bal))}${stat("Current term",feeState(u)[0],termLabel())}</div>${form}<h2 style="margin-bottom:12px">Payment history</h2>${table}`,
   `<button class="btn" data-act="payback">Back to fees</button>`);
}
function vReceipt(){
  const p=DB.payments.find(x=>x.id===V.pid), u=p&&byId(p.sid); if(!p||!u)return vAdminDash();
  const text=`${S().school}\nFEE RECEIPT ${p.rcpt}\nDate: ${fmtDate(p.date)}\nReceived from: ${u.guardian||fullName(u)} for ${fullName(u)} (Adm ${u.roll}, ${u.cl})\nTerm: ${p.term}, ${p.year}\nAmount: ${money(p.amount)}\nMethod: ${p.method}${p.ref?" ("+p.ref+")":""}\nBalance for Term ${p.term}, ${p.year} now: ${money(balOf(u,p.term,p.year))}`;
  return portal("Fee receipt",p.rcpt,`<div class="rc"><header><div><h2>${brandName()}</h2><div class="muted">Fee receipt</div></div><div class="mono" style="text-align:right">${esc(p.rcpt)}<div class="muted">${fmtDate(p.date)}</div></div></header>
   <div class="meta"><div><small>Learner</small>${esc(fullName(u))}</div><div><small>Admission no.</small><span class="mono">${esc(u.roll)}</span></div><div><small>Class</small>${esc(u.cl)}</div><div><small>Term</small>Term ${p.term}, ${p.year}</div><div><small>Paid by</small>${esc(u.guardian)||"—"}</div><div><small>Method</small>${esc(p.method)}${p.ref?` · <span class="mono">${esc(p.ref)}</span>`:""}</div></div>
   <div class="sum"><div><small class="muted">Amount received</small><b class="num">${money(p.amount)}</b></div><div><small class="muted">Balance for Term ${p.term}, ${p.year}</small><b class="num">${money(balOf(u,p.term,p.year))}</b></div></div></div>
   <div style="margin-top:14px"><button class="btn" data-act="copyreceipt">Copy as text</button><button class="btn" data-act="print">Print</button></div>`,
   `<button class="btn" data-act="receiptback">Back to payments</button>`) + (UI.receiptText=text,"");
}

/* notices, admins, settings, password */
function vNotices(){
  return portal("Notices","Posted notices appear on every dashboard",
   `<div class="card" style="max-width:640px;margin-bottom:24px"><form class="form" data-form="notice" novalidate style="margin-top:0"><label class="f">New notice<textarea id="n_msg" name="message" rows="3" maxlength="500" required></textarea></label><div class="err" id="ferr" hidden></div><div><button class="btn primary">Post notice</button></div></form></div>${noticeList(ME.role==="admin")}`);
}
function vAdmins(){
  const list=users("admin");
  return portal("Admins","Only existing admins can add another admin",`<div class="tablewrap" style="margin-bottom:24px"><table><thead><tr><th>Name</th><th>Username</th><th></th></tr></thead><tbody>${list.map(u=>`<tr><td>${esc(fullName(u))}</td><td class="mono">${esc(u.username)}</td><td>${u.id===ME.id?'<span class="pill good">You</span>':list.length>1?`<div style="display:flex;justify-content:flex-end"><button class="btn sm bad" data-act="remove" data-id="${u.id}" data-ctx="purge">Remove</button></div>`:""}</td></tr>`).join("")}</tbody></table></div>
   <div class="card" style="max-width:480px"><h3>Add an admin</h3><form class="form" data-form="add:admin" novalidate><div class="grid2"><label class="f">First name<input id="f_first" name="first" required></label><label class="f">Last name<input id="f_last" name="last" required></label></div><label class="f">Username<input id="f_username" name="username" required autocomplete="username"></label><label class="f">Password<input id="f_pw" name="pw" type="password" minlength="6" required autocomplete="new-password"></label><div class="err" id="ferr" hidden></div><button class="btn primary">Add admin</button></form></div>`);
}
function vSettings(){
  const st=S();
  return portal("Settings","School name, current term and the subjects for each level",
   `<form class="form" data-form="settings" novalidate style="max-width:720px;margin-top:0">
    <div class="card"><h3>School and term</h3><div class="form">
     <label class="f">School name<input id="s_school" name="school" value="${esc(st.school)}" maxlength="60" required></label>
     <div class="grid2"><label class="f">Year<input id="s_year" name="year" type="number" min="2020" max="2100" value="${st.year}" required></label>
     <label class="f">Current term<select id="s_term" name="term">${[1,2,3].map(t=>`<option value="${t}" ${st.term===t?"selected":""}>Term ${t}</option>`).join("")}</select></label></div>
     <p class="muted">Changing the term or year starts a new fee balance for every learner. Earlier payments stay in their history and keep the term they were paid into. Exams and report cards follow the current term.</p></div></div>
    <div class="card" style="margin-top:16px"><h3>Subjects</h3><p class="muted" style="margin-top:4px">One line per level group, separated by commas. Keep the same number of subjects when renaming so saved marks can follow them. Senior school electives depend on each learner's pathway, so rename Elective 1 to 3 to suit your school.</p><div class="form">
     ${Object.entries(GROUPS).map(([g,label])=>`<label class="f">${esc(label)}<textarea id="s_sub_${g}" name="sub_${g}" rows="2">${esc((st.subjects[g]||[]).join(", "))}</textarea></label>`).join("")}</div></div>
    <div class="err" id="ferr" hidden style="margin-top:14px"></div><div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary">Save settings</button></div></form>
    <div class="card" style="margin-top:16px;max-width:720px"><h3>Backup</h3><p class="muted" style="margin-top:4px">Everything is stored in this browser. Download a copy before clearing browser data, changing computer, or moving this to a server.</p><div class="row" style="margin-top:10px"><button class="btn" data-act="backup">Download backup</button><button class="btn ghost" data-act="restorefile">Restore from backup</button></div></div>`);
}
function vPassword(){
  return portal("Change password",`Signed in as ${ME.username}`,
   `<div class="card" style="max-width:460px"><form class="form" data-form="password" novalidate style="margin-top:0">
    <label class="f">Current password<input id="pw_cur" name="current" type="password" autocomplete="current-password" required></label>
    <label class="f">New password <span class="hint">at least 6 characters</span><input id="pw_new" name="next" type="password" autocomplete="new-password" minlength="6" required></label>
    <label class="f">Repeat new password<input id="pw_rep" name="confirm" type="password" autocomplete="new-password" required></label>
    <div class="err" id="ferr" hidden></div><div><button class="btn primary">Change password</button></div></form></div>`);
}

/* backup helpers */
function downloadBackup(){
  try{
    const blob=new Blob([JSON.stringify(DB,null,1)],{type:"application/json"});
    const url=URL.createObjectURL(blob), a=document.createElement("a");
    a.href=url;a.download=`schoolhouse-${S().school.replace(/[^\w-]+/g,"_")}-${today()}.json`;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);toast("Backup downloaded");
  }catch(e){toast("Download is blocked in this browser")}
}
function importBackup(){
  const inp=document.createElement("input");inp.type="file";inp.accept=".json,application/json";
  inp.onchange=async()=>{
    const file=inp.files&&inp.files[0];if(!file)return;
    try{
      const d=parse(await file.text());
      if(!d||!Array.isArray(d.users)||!d.settings)throw new Error("shape");
      askConfirm("Replace everything stored in this browser with that backup file?","Replace",()=>{DB=d;migrate();save();ME=getSess()?byId(getSess())||null:null;go(ME?"dash":"home");toast("Backup restored")});
    }catch(e){toast("That file is not a Schoolhouse backup")}
  };
  inp.click();
}

/* ---------- teacher and student ---------- */
function vTeacherDash(){
  return portal("Dashboard",`${termLabel()} · welcome, ${ME.first}`,`<div class="stats">${stat("Salary per month",money(ME.salary))}${stat("TSC number",esc(ME.tsc)||"—")}${stat("Joined",fmtDate(ME.joined))}${stat("Learners",users("student",true).length,"across all classes")}</div><h2 style="margin-bottom:12px">Notice board</h2>${noticeList(false)}`);
}
function latestResult(s){
  for(const ex of [...EXAMS].reverse()){const r=classResults(s.cl,ex).rows.find(x=>x.s.id===s.id);if(r&&r.complete)return{ex,r,g:gradeOf(s.cl,r.mean)}}
  return null;
}
function myPayments(){
  const ps=DB.payments.filter(p=>p.sid===ME.id).sort((a,b)=>b.date.localeCompare(a.date));
  if(!ps.length)return `<div class="empty">No payments have been recorded yet.</div>`;
  return `<div class="tablewrap"><table style="min-width:520px"><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Term</th><th class="r">Amount</th></tr></thead><tbody>${ps.map(p=>`<tr><td class="mono">${esc(p.rcpt)}</td><td>${fmtDate(p.date)}</td><td>${esc(p.method)}${p.ref?` · <span class="mono">${esc(p.ref)}</span>`:""}</td><td>T${p.term} ${p.year}</td><td class="r num">${money(p.amount)}</td></tr>`).join("")}</tbody></table></div>`;
}
function vStudentDash(){
  const mine=DB.attendance.filter(a=>a.sid===ME.id), p=mine.filter(a=>a.status==="Present").length, lr=latestResult(ME);
  return portal("Dashboard",`${termLabel()} · welcome, ${ME.first}`,`<div class="stats">${stat("Admission no.",esc(ME.roll),esc(ME.cl))}${stat("Fee balance",money(balOf(ME)),`${money(paidOf(ME.id))} paid of ${money(ME.fee)}`)}${stat("Attendance",mine.length?Math.round(p/mine.length*100)+"%":"—",mine.length?`${p} of ${mine.length} days present`:"No records yet")}${stat("Latest result",lr?lr.g.g:"—",lr?`${lr.ex}, mean ${lr.r.mean.toFixed(1)}`:"No complete result yet")}</div><h2 style="margin-bottom:12px">My fee payments</h2>${myPayments()}<h2 style="margin:26px 0 12px">Notice board</h2>${noticeList(false)}`);
}
function vMyAtt(){
  const date=UI.myDate||today(), rec=DB.attendance.find(a=>a.sid===ME.id&&a.date===date);
  const all=DB.attendance.filter(a=>a.sid===ME.id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
  return portal("My attendance","You can only see your own record",`<div class="bar"><label class="f">Date<input id="a_date" type="date" value="${date}" max="${today()}" data-act="mydatechg"></label></div>
   <div class="card" style="max-width:420px;margin-bottom:24px"><div class="muted">${fmtDate(date)}</div><div style="margin-top:6px">${rec?`<span class="pill ${rec.status==="Present"?"good":"bad"}" style="font-size:15px">${rec.status}</span>`:`<span class="pill warn" style="font-size:15px">No record for this date</span>`}</div></div>
   <h2 style="margin-bottom:12px">Recent days</h2>${all.length?`<div class="tablewrap"><table style="min-width:320px"><thead><tr><th>Date</th><th>Status</th></tr></thead><tbody>${all.map(a=>`<tr><td>${fmtDate(a.date)}</td><td><span class="pill ${a.status==="Present"?"good":"bad"}">${a.status}</span></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No attendance has been recorded for you yet.</div>`}`);
}

/* ---------- router ---------- */
function render(keep=false){
  const draft=keep?draftGet():null;
  const app=$("#app"); let h;
  const [n,arg]=V.name.split(":"); if(arg)V.role=arg;
  if(ME){
    if(ME.role!=="admin"&&!ME.approved)h=vWait();
    else if(ME.role==="admin"){
      const m={dash:vAdminDash,teachers:()=>vPeople("teacher"),students:()=>vPeople("student"),attendance:vAttendance,exams:vExams,report:vReport,fees:vFees,pay:vPay,receipt:vReceipt,notices:vNotices,admins:vAdmins,settings:vSettings,edit:vEdit,password:vPassword};
      h=(m[n]||vAdminDash)();
    }else if(ME.role==="teacher"){
      const m={dash:vTeacherDash,attendance:vAttendance,exams:vExams,report:vReport,notices:vNotices,password:vPassword};h=(m[n]||vTeacherDash)();
    }else{const m={dash:vStudentDash,myatt:vMyAtt,myreport:vMyReport,password:vPassword};h=(m[n]||vStudentDash)()}
  }else{
    const m={home:vHome,about:vAbout,contact:vContact,login:vLogin,signup:vSignup};h=(m[n]||vHome)();
  }
  app.innerHTML=h;
  if(draft)draftSet(draft);
  document.title=S().school+" · Schoolhouse";
}

/* ---------- actions ---------- */
function showErr(msg){const e=$("#ferr");if(e){e.textContent=msg;e.hidden=false}else toast(msg)}
function afterLogin(u){ME=u;setSess(u.id);go("dash")}
const NAME_RE=/^[a-zA-Z0-9._-]{3,20}$/;
function checkPerson(f,role,selfId){
  const un=(f.username||"").trim().toLowerCase();
  if(!f.first?.trim()||!f.last?.trim())return{err:"Enter first and last name."};
  if(!un)return{err:"Enter a username."};
  if(!NAME_RE.test(un))return{err:"Username must be 3 to 20 characters: letters, numbers, dot, dash or underscore."};
  if(DB.users.some(u=>u.username.toLowerCase()===un&&u.id!==selfId))return{err:"That username is taken. Choose another."};
  const out={};
  if(role==="student"){
    const adm=(f.roll||"").trim();
    if(!adm)return{err:"Enter an admission number."};
    if(DB.users.some(u=>u.role==="student"&&u.roll===adm&&u.id!==selfId))return{err:`Admission number ${adm} is already in use.`};
    if(!LEVELS.includes(f.cl))return{err:"Choose a class."};
    if(!f.guardian?.trim())return{err:"Enter the parent or guardian's name."};
    const ph=normPhone(f.mobile);if(!ph)return{err:"Enter a Kenyan mobile number such as 0712 345 678 or +254 712 345 678."};
    out.mobile=ph;
  }else if(role==="teacher"){
    const ph=normPhone(f.mobile);if(!ph)return{err:"Enter a Kenyan mobile number such as 0712 345 678 or +254 712 345 678."};
    out.mobile=ph;
  }
  return out;
}
const sidsOfGroup=g=>new Set(DB.users.filter(u=>u.role==="student"&&grpOf(u.cl)===g).map(u=>u.id));
function subjectRenames(oldSubs,newSubs){
  const pairs=[];
  for(const g of Object.keys(GROUPS)){
    const o=oldSubs[g]||[], n=newSubs[g]||[];
    if(o.length!==n.length)continue;
    for(let i=0;i<o.length;i++)if(o[i]!==n[i])pairs.push([g,o[i],n[i]]);
  }
  return pairs;
}
function marksUsing(pairs){
  const ids={};
  return pairs.reduce((x,[g,oldName])=>{
    ids[g]=ids[g]||sidsOfGroup(g);
    return x+DB.marks.filter(m=>m.subject===oldName&&ids[g].has(m.sid)).length;
  },0);
}
function applyRenames(pairs){
  const ids={}, maps={};
  for(const [g,oldName,newName] of pairs){ids[g]=ids[g]||sidsOfGroup(g);(maps[g]=maps[g]||new Map()).set(oldName,newName)}
  const before=DB.marks.map(m=>m.subject);
  DB.marks.forEach((m,i)=>{const g=grpOf(byId(m.sid)?.cl||"");const map=maps[g];if(map&&map.has(before[i]))m.subject=map.get(before[i])});
}
async function handleForm(form){
  const [kind,arg]=form.dataset.form.split(":");
  const f=Object.fromEntries(new FormData(form).entries());
  const oldErr=$("#ferr");if(oldErr)oldErr.hidden=true;
  if(kind==="contact"){
    if(!f.name.trim()||!f.message.trim()||!/^\S+@\S+\.\S+$/.test(f.email))return showErr("Fill in your name, a valid email and a message.");
    DB.messages.push({id:uid(),date:today(),name:f.name.trim(),email:f.email.trim(),message:f.message.trim()});save();UI.sent=true;render();return;
  }
  if(kind==="login"){
    const u=DB.users.find(x=>!x.archived&&x.username.toLowerCase()===(f.username||"").trim().toLowerCase()&&x.role===arg);
    if(!u||!(await checkPw(u,f.pw||"")))return showErr("Username or password is wrong for this portal.");
    return afterLogin(u);
  }
  if(kind==="signup"||kind==="add"){
    const role=arg, c=checkPerson(f,role);
    let err=c.err;
    if(!err&&(!f.pw||f.pw.length<6))err="Password needs at least 6 characters.";
    if(!err&&role==="admin"&&kind==="signup"&&users("admin").length>0)err="Admin signup is closed.";
    if(err)return showErr(err);
    const np=await makePw(f.pw);
    const u={id:uid(),role,username:f.username.trim(),pw:np.pw,psalt:np.psalt,first:f.first.trim(),last:f.last.trim(),mobile:c.mobile||"",joined:today(),approved:kind==="add"||role==="admin"};
    if(role==="student")Object.assign(u,{roll:f.roll.trim(),cl:f.cl,gender:f.gender,fee:Math.max(0,Number(f.fee)||0),guardian:f.guardian.trim()});
    if(role==="teacher")Object.assign(u,{tsc:(f.tsc||"").trim(),salary:Math.max(0,Number(f.salary)||0)});
    DB.users.push(u);save();
    if(kind==="signup"){toast(role==="admin"?"Admin created. Log in now.":"Registered. Wait for approval, then log in.");return go("login:"+role)}
    toast(`${cap(role)} added`);UI[role+"Tab"]="active";return go(role==="admin"?"admins":role+"s");
  }
  if(kind==="edit"){
    const u=byId(arg);if(!u)return;
    const c=checkPerson(f,u.role,u.id);let err=c.err;
    if(!err&&f.pw&&f.pw.length<6)err="New password needs at least 6 characters.";
    if(!err&&u.role==="student"&&Math.max(0,Number(f.fee)||0)<paidOf(u.id))err=`The fee can't be lower than the ${money(paidOf(u.id))} already paid this term.`;
    if(err)return showErr(err);
    Object.assign(u,{first:f.first.trim(),last:f.last.trim(),username:f.username.trim(),mobile:c.mobile||u.mobile});
    if(f.pw){const np=await makePw(f.pw);u.pw=np.pw;u.psalt=np.psalt}
    if(u.role==="student"){
      if(u.cl!==f.cl)DB.attendance=DB.attendance.filter(a=>a.sid!==u.id);
      Object.assign(u,{roll:f.roll.trim(),cl:f.cl,gender:f.gender,fee:Math.max(0,Number(f.fee)||0),guardian:f.guardian.trim()});
    }else Object.assign(u,{tsc:(f.tsc||"").trim(),salary:Math.max(0,Number(f.salary)||0)});
    save();toast("Changes saved");return go(u.role+"s");
  }
  if(kind==="password"){
    if(!(await checkPw(ME,f.current||"")))return showErr("The current password is wrong.");
    if(!f.next||f.next.length<6)return showErr("The new password needs at least 6 characters.");
    if(f.next!==f.confirm)return showErr("The two new passwords don't match.");
    if(f.next===f.current)return showErr("Choose a password that is different from the current one.");
    const np=await makePw(f.next);ME.pw=np.pw;ME.psalt=np.psalt;save();form.reset();toast("Password changed");return;
  }
  if(kind==="settings"){
    const year=Math.round(Number(f.year)),term=Number(f.term);
    if(!f.school.trim())return showErr("Enter the school name.");
    if(!(year>=2020&&year<=2100))return showErr("Enter a valid year.");
    const oldSubs=JSON.parse(JSON.stringify(S().subjects)), subjects={};
    for(const g of Object.keys(GROUPS)){
      const list=[...new Set((f["sub_"+g]||"").split(",").map(x=>x.trim()).filter(Boolean))];
      if(!list.length)return showErr(`Add at least one subject for ${GROUPS[g]}.`);
      subjects[g]=list;
    }
    const changed=year!==S().year||term!==S().term;
    DB.settings={school:f.school.trim(),year,term,subjects};save();
    const pairs=subjectRenames(oldSubs,subjects), stale=marksUsing(pairs);
    toast(changed?`${termLabel()} started. Fee balances are reset.`:"Settings saved");render();
    if(stale)askConfirm(`${stale} saved marks still carry the old subject names from this rename. Relabel them to the new names in the same order?`,"Relabel marks",()=>{applyRenames(pairs);save();toast("Marks relabelled");render()});
    return;
  }
  if(kind==="pay"){
    const u=byId(arg);if(!u)return;
    const amt=Math.round(Number(f.amount)), ref=(f.ref||"").trim().toUpperCase();
    if(!(amt>0))return showErr("Enter an amount greater than zero.");
    if(!f.date)return showErr("Pick the date the payment was made.");
    if(f.date>today())return showErr("A payment cannot be dated in the future.");
    const st=stampOf(f.date), bal=balOf(u,st.term,st.year);
    if(amt>bal)return showErr(`Term ${st.term}, ${st.year} has a balance of ${money(bal)} for ${fullName(u)}.`);
    if(f.method==="M-Pesa"&&!/^[A-Z0-9]{10}$/.test(ref))return showErr("An M-Pesa code has 10 letters and digits, for example SJK4X9P2QA.");
    DB.rcpt=(DB.rcpt||0)+1;
    DB.payments.push({id:uid(),sid:u.id,amount:amt,date:f.date,method:f.method,ref,term:st.term,year:st.year,rcpt:"RCT-"+String(DB.rcpt).padStart(4,"0")});
    save();UI.payDate=f.date;toast(`${u.first}: ${money(amt)} posted to Term ${st.term}, ${st.year}`);return render();
  }
  if(kind==="notice"){
    if(!f.message.trim())return showErr("Write a notice first.");
    DB.notices.push({id:uid(),date:today(),by:ME.first,message:f.message.trim()});save();toast("Notice posted");return go(ME.role==="admin"?"notices":"dash");
  }
  if(kind==="takeatt"){
    const date=f.date; if(!date)return toast("Pick a date");
    if(date>today())return toast("A register cannot be dated in the future.");
    const st=users("student",true).filter(s=>s.cl===V.cl);
    DB.attendance=DB.attendance.filter(a=>!(a.cl===V.cl&&a.date===date));
    st.forEach(s=>DB.attendance.push({date,cl:V.cl,sid:s.id,status:f["s_"+s.id]==="Absent"?"Absent":"Present"}));
    save();UI.attDate=date;UI.attMode="view";toast("Register saved");render();return;
  }
  if(kind==="marks"){
    const cl=V.cl, subs=subjectsFor(cl), exam=UI.exam||"Mid-term", {term,year}=S();
    const st=users("student",true).filter(s=>s.cl===cl), fresh=[];
    for(const s of st)for(let i=0;i<subs.length;i++){
      const raw=(f[`m_${s.id}_${i}`]??"").trim();if(raw==="")continue;
      if(/^a(bs|bsent)?$/i.test(raw)){fresh.push({sid:s.id,term,year,exam,subject:subs[i],score:null,absent:true});continue}
      const n=Number(raw);
      if(!isFinite(n)||n<0||n>100)return showErr(`Marks must be between 0 and 100, or A for absent. Check ${fullName(s)}, ${subs[i]}.`);
      fresh.push({sid:s.id,term,year,exam,subject:subs[i],score:n,absent:false});
    }
    const ids=new Set(st.map(s=>s.id));
    DB.marks=DB.marks.filter(m=>!(ids.has(m.sid)&&m.exam===exam&&m.term===term&&m.year===year&&subs.includes(m.subject)));
    DB.marks.push(...fresh);save();UI.examMode="results";
    const part=classResults(cl,exam).rows.filter(r=>r.sat>0&&!r.complete);
    toast(part.length?`Marks saved. ${part.length} learner${part.length===1?"":"s"} still missing papers.`:"Marks saved");render();return;
  }
}
function purgeUser(id){
  const u=byId(id);if(!u)return;
  DB.users=DB.users.filter(x=>x.id!==id);
  DB.attendance=DB.attendance.filter(a=>a.sid!==id);DB.payments=DB.payments.filter(p=>p.sid!==id);DB.marks=DB.marks.filter(m=>m.sid!==id);
  save();toast(`${fullName(u)} deleted`);render();
}
function archiveUser(id){
  const u=byId(id);if(!u)return;
  u.archived=true;u.approved=false;
  if(ME&&ME.id===id){ME=null;setSess(null);go("home")}
  save();toast(`${fullName(u)} archived. Attendance, marks and payment history kept.`);render();
}
document.addEventListener("submit",e=>{const f=e.target.closest("form[data-form]");if(f){e.preventDefault();handleForm(f)}});
document.addEventListener("change",e=>{
  const t=e.target,a=t.dataset.act;
  if(a==="datechg"){UI.attDate=t.value;render(true)}
  else if(a==="mydatechg"){UI.myDate=t.value;render(true)}
  else if(a==="paydatechg"){UI.payDate=t.value;render(true)}
  else if(a==="examchg"){UI.exam=t.value;render(true)}
  else if(a==="methodchg"){UI.method=t.value;render(true)}
  else if(t.id==="a_date"&&t.closest("form")){UI.attDate=t.value;render(true)}
});
window.addEventListener("storage",e=>{
  if(e.key!==KEY)return;
  const d=parse(e.newValue);if(!d||!Array.isArray(d.users))return;
  DB=d;ME=getSess()?byId(getSess())||null:null;
  render();toast("Updated from another tab");
});
document.addEventListener("click",e=>{
  const g=e.target.closest("[data-go]");
  if(g){e.preventDefault();const k=g.dataset.go;
    if("cl" in g.dataset){V={name:k,cl:g.dataset.cl||undefined};render();window.scrollTo(0,0);return}
    UI.sent=false;
    if(k.startsWith("portal:")){go("login:"+k.split(":")[1]);return}
    go(k);return}
  const a=e.target.closest("[data-act]");if(!a||a.tagName==="INPUT"||a.tagName==="SELECT")return;
  const act=a.dataset.act,id=a.dataset.id;
  if(act==="fill"){$("#l_u").value=a.dataset.u;$("#l_p").value=a.dataset.p}
  else if(act==="logout"){ME=null;setSess(null);go("home")}
  else if(act==="reset")askConfirm("Reset all demo data? Everything you added will be lost.","Reset",async()=>{ME=null;setSess(null);await seed();go("home");toast("Demo data restored")});
  else if(act==="cancel")closeLayer();
  else if(act==="yes"){const fn=UI.confirmFn;closeLayer();fn&&fn()}
  else if(act==="backup")downloadBackup();
  else if(act==="restorefile")importBackup();
  else if(act==="dismissbar"){a.closest(".storagebar")?.remove();saveWarned=false}
  else if(act==="tab"){UI[a.dataset.role+"Tab"]=a.dataset.tab;render(true)}
  else if(act==="approve"){const u=byId(id);if(u){u.approved=true;save();toast(`${u.first} approved`);render()}}
  else if(act==="restore"){const u=byId(id);if(u){u.archived=false;u.approved=true;save();toast(`${u.first} restored`);render()}}
  else if(act==="remove"){const u=byId(id);if(!u)return;const ctx=a.dataset.ctx;
    if(ctx==="reject")return askConfirm(`Reject ${fullName(u)}'s application?`,"Reject",()=>purgeUser(id));
    if(ctx==="purge"){const paid=DB.payments.filter(p=>p.sid===id).reduce((x,p)=>x+p.amount,0);
      return askConfirm(paid?`Delete ${fullName(u)} permanently? This destroys ${money(paid)} of payment history and cannot be undone.`:`Delete ${fullName(u)} permanently? This cannot be undone.`,"Delete permanently",()=>purgeUser(id))}
    if(u.role==="student"){const n=DB.payments.filter(p=>p.sid===id).length;
      return askConfirm(n?`Remove ${fullName(u)} from the class list? ${n} payment record${n===1?"":"s"} stay in the archive so the accounts still balance.`:`Remove ${fullName(u)} from the class list?`,"Remove",()=>archiveUser(id))}
    askConfirm(`Remove ${fullName(u)} from staff? This cannot be undone.`,"Remove",()=>purgeUser(id))}
  else if(act==="edit"){V={name:"edit",id,nav:byId(id).role+"s"};render();window.scrollTo(0,0)}
  else if(act==="canceledit")go(a.dataset.role+"s");
  else if(act==="pay"){UI.payDate=today();UI.method="M-Pesa";V={name:"pay",id,from:V.name,cl:V.cl,nav:V.name==="fees"?"fees":"students"};render();window.scrollTo(0,0)}
  else if(act==="payback"){if(V.from==="fees"){V={name:"fees",cl:V.cl};render()}else{UI.studentTab="fees";go("students")}}
  else if(act==="delpay")askConfirm("Delete this payment record? The balance for that term goes back up.","Delete",()=>{DB.payments=DB.payments.filter(p=>p.id!==id);save();toast("Payment deleted");render()});
  else if(act==="receipt"){V={name:"receipt",pid:id,uid:V.id,from:V.from,cl:V.cl,nav:"fees"};render();window.scrollTo(0,0)}
  else if(act==="receiptback"){V={name:"pay",id:V.uid,from:V.from,cl:V.cl,nav:V.from==="fees"?"fees":"students"};render()}
  else if(act==="copyreceipt")copyText(UI.receiptText||"");
  else if(act==="attmode"){UI.attMode=a.dataset.m;render(true)}
  else if(act==="exammode"){UI.examMode=a.dataset.m;render(true)}
  else if(act==="report"){V={name:"report",id,cl:V.cl,nav:"exams"};render();window.scrollTo(0,0)}
  else if(act==="reportback"){V={name:"exams",cl:V.cl};UI.examMode="results";render()}
  else if(act==="copyreport")copyText(UI.reportText||"");
  else if(act==="print")window.print();
  else if(act==="allp"){document.querySelectorAll('#app input[type=radio][value=Present]').forEach(r=>r.checked=true)}
  else if(act==="delnotice")askConfirm("Delete this notice?","Delete",()=>{DB.notices=DB.notices.filter(n=>n.id!==id);save();render()});
  else if(act==="delmsg"){DB.messages=DB.messages.filter(m=>m.id!==id);save();render()}
});

/* ---------- boot ---------- */
function insecureBar(){
  const b=document.createElement("div");b.className="storagebar";
  b.innerHTML=`<span><b>Not running over HTTPS.</b> Password checks fall back to a weak demo hash, so anyone with this file can get in. Serve it over HTTPS or localhost before real data goes in.</span><button class="btn sm ghost" data-act="dismissbar">Dismiss</button>`;
  Object.assign(b.style,{position:"fixed",left:"12px",right:"12px",top:"12px",zIndex:"60",display:"flex",gap:"10px",alignItems:"center",flexWrap:"wrap",padding:"10px 14px",borderRadius:"10px",background:"#3b2a12",color:"#fde68a",boxShadow:"0 8px 30px rgba(0,0,0,.35)"});
  document.body.appendChild(b);
}
(async()=>{
  DB=load();
  if(!DB||!Array.isArray(DB.users))await seed();
  else{migrate();save()}
  const sid=getSess(), u=sid?byId(sid):null;
  ME=u&&!u.archived?u:null;if(!ME)setSess(null);
  V={name:ME?"dash":"home"};render();
  if(!HAS_SUBTLE)insecureBar();
  const tb=$("#themeBtn");
  if(tb)tb.addEventListener("click",()=>{
    const r=document.documentElement,dark=r.dataset.theme?r.dataset.theme==="dark":matchMedia("(prefers-color-scheme:dark)").matches;
    r.dataset.theme=dark?"light":"dark";
  });
})();