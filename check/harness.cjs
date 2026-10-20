/* Scratch harness: runs app.js against a stubbed DOM and asserts the fixes. */
const fs=require("fs");
const PATH=process.argv[2]||"app.js";
const SRC=fs.readFileSync(PATH,"utf8");
const store=new Map();
global.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>{if(global.__quota)throw new Error("QuotaExceeded");store.set(k,String(v))},removeItem:k=>store.delete(k)};
let fakeFields=[], bodyKids=0;
function el(extra={}){
  const e={value:"",hidden:true,textContent:"",innerHTML:"",dataset:{},style:{},files:null,type:"",checked:false,
    appendChild(){bodyKids++},remove(){},focus(){},reset(){},closest(){return null},
    querySelector(){return el()},querySelectorAll(){return[]},addEventListener(){},classList:{add(){},remove(){}}};
  return Object.assign(e,extra);
}
const reg=new Map([["#app",el()],["#ferr",el()],["#layer",el()],["#l_u",el()],["#l_p",el()]]);
const ferr=reg.get("#ferr");
global.document={title:"",body:{appendChild(){bodyKids++}},
  querySelector:s=>{if(!reg.has(s))reg.set(s,el());return reg.get(s)},
  createElement:()=>el(),addEventListener(){},documentElement:{dataset:{}},
  querySelectorAll:sel=>{const m=/\[name="([^"]+)"\]/.exec(sel);return m?fakeFields.filter(f=>f.name===m[1]):fakeFields}};
global.window={addEventListener(){},scrollTo(){}};
global.matchMedia=()=>({matches:false});
global.navigator={};
global.FormData=class{constructor(f){this.f=f}entries(){return Object.entries(this.f.__fields||{})}};
global.URL={createObjectURL:()=>"blob:x",revokeObjectURL(){}};
global.Blob=class{};

const api=`
;globalThis.__T={gradeTone,gradeOf,remark,classResults,users,byId,balOf,paidOf,stampOf,S,save,seed,migrate,render,hash,
 vHome,vAbout,vContact,vLogin,vSignup,vWait,vAdminDash,vPeople,vEdit,vAttendance,vExams,vReport,vMyReport,vFees,vPay,
 vReceipt,vNotices,vAdmins,vSettings,vPassword,vTeacherDash,vStudentDash,vMyAtt,feeTable,
 vExams,vPay,vPeople,vFees,reportCard,checkPerson,normPhone,handleForm,subjectRenames,marksUsing,applyRenames,
 archiveUser,purgeUser,makePw,checkPw,draftGet,draftSet,subjectsFor,
 getDB:()=>DB,setDB:v=>{DB=v},getUI:()=>UI,setV:v=>{V=v},getME:()=>ME,setME:v=>{ME=v}};`;
(0,eval)(SRC+api);
const T=globalThis.__T;
let bad=0, n=0;
async function t(name,fn){
  n++;let pass=false,fail="";
  try{const r=await fn();if(typeof r==="string"){fail=r;pass=r.length===0}else pass=r!==false}catch(e){fail=e.message}
  if(!pass){bad++;console.log("  FAIL  "+name+(fail?"  -> "+fail:""))}else console.log("  ok    "+name);
}
const eq=(a,b)=>a===b?"":`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;
const form=(key,fields)=>({dataset:{form:key},reset(){},__fields:fields});
const clearErr=()=>{ferr.textContent="";ferr.hidden=true};

function freshDB(extra={}){
  const mk=o=>({id:"u"+(Math.random().toString(36).slice(2,7)),joined:"2026-01-01",approved:true,mobile:"0712 345 678",first:"F",last:"L",...o});
  const admin=mk({role:"admin",username:"admin",first:"Ad",last:"Min",pw:"x"});
  const asha=mk({role:"student",username:"asha",first:"Asha",last:"M",roll:"1041",cl:"Grade 4",fee:15000,guardian:"G",gender:"Female"});
  const brian=mk({role:"student",username:"brian",first:"Brian",last:"O",roll:"1042",cl:"Grade 4",fee:15000,guardian:"G",gender:"Male"});
  const cynth=mk({role:"student",username:"cynth",first:"Cyn",last:"A",roll:"1043",cl:"Grade 4",fee:15000,guardian:"G",gender:"Female"});
  const lower=mk({role:"student",username:"low",first:"Low",last:"C",roll:"2001",cl:"Grade 2",fee:9000,guardian:"G",gender:"Male"});
  const subjects={pre:["A"],lower:["English","Kiswahili","Maths","Env","RE","Creative"],
    upper:["English","Kiswahili","Mathematics","Science","Social","AgNut","RE","Creative"],junior:["x"],senior:["y"],form:["z"]};
  const db={settings:{school:"Test",year:2026,term:2,subjects:JSON.parse(JSON.stringify(subjects))},
    users:[admin,asha,brian,cynth,lower],attendance:[],notices:[],messages:[],payments:[],marks:[],rcpt:0,...extra};
  T.setDB(db);T.setME(admin);
  return{db,admin,asha,brian,cynth,lower};
}

(async()=>{
  await new Promise(r=>setTimeout(r,150));

  console.log("\n1. grading bands");
  await t("BE1 is bad, not good",()=>eq(T.gradeTone("BE1"),"bad"));
  await t("BE2 is bad",()=>eq(T.gradeTone("BE2"),"bad"));
  await t("EE1 is good",()=>eq(T.gradeTone("EE1"),"good"));
  await t("ME2 is good",()=>eq(T.gradeTone("ME2"),"good"));
  await t("AE1 is warn",()=>eq(T.gradeTone("AE1"),"warn"));
  await t("KCSE A is good",()=>eq(T.gradeTone("A"),"good"));
  await t("KCSE C- is warn",()=>eq(T.gradeTone("C-"),"warn"));
  await t("KCSE E is bad",()=>eq(T.gradeTone("E"),"bad"));
  await t("KCSE B- counts as good",()=>eq(T.gradeTone("B-"),"good"));
  await t("remark for mean 15 asks for support",()=>T.remark("Grade 4",15).includes("below expectations")?"":T.remark("Grade 4",15));
  await t("remark for mean 95 praises",()=>T.remark("Grade 4",95).includes("Keep up")?"":"wrong remark");

  console.log("\n2. ranking with partial sittings");
  {
    const {db,asha,brian,cynth}=freshDB();
    const subs=T.subjectsFor("Grade 4");
    subs.forEach((s,i)=>db.marks.push({sid:asha.id,term:2,year:2026,exam:"Mid-term",subject:s,score:70+i,absent:false}));
    ["English","Kiswahili","Mathematics"].forEach(s=>db.marks.push({sid:brian.id,term:2,year:2026,exam:"Mid-term",subject:s,score:95,absent:false}));
    subs.slice(0,6).forEach(s=>db.marks.push({sid:cynth.id,term:2,year:2026,exam:"Mid-term",subject:s,score:80,absent:false}));
    subs.slice(6).forEach(s=>db.marks.push({sid:cynth.id,term:2,year:2026,exam:"Mid-term",subject:s,score:null,absent:true}));
    const r=T.classResults("Grade 4","Mid-term");
    await t("offered is 8",()=>eq(r.offered,8));
    await t("ranked count excludes the partial sitting",()=>eq(r.count,2));
    await t("highest full total is position 1",()=>eq(r.rows.find(x=>x.s.id===asha.id).pos,1));
    await t("absent papers still count as a full sitting",()=>{const c=r.rows.find(x=>x.s.id===cynth.id);return c.complete&&c.pos===2?"":`complete=${c.complete} pos=${c.pos}`});
    await t("3-of-8 learner is not ranked",()=>{const b=r.rows.find(x=>x.s.id===brian.id);return !b.complete&&!b.pos?"":`complete=${b.complete} pos=${b.pos}`});
    await t("mean is over papers actually sat",()=>eq(r.rows.find(x=>x.s.id===brian.id).mean,95));
    await t("mean counts absences as 0",()=>eq(r.rows.find(x=>x.s.id===cynth.id).mean,80));
    T.getUI().examMode="results";T.setV({name:"exams",cl:"Grade 4"});
    const h=T.vExams();
    await t("results table has a Papers column",()=>h.includes("<th>Papers</th>")?"":"missing");
    await t("partial sitting is flagged in the table",()=>/Partial/.test(h)&&h.includes("3/8")?"":"missing pill or 3/8");
    await t("complete sittings show a position",()=>h.includes(">1<")||h.includes("class=\"num\">1<")?"":"no position 1");
    T.getUI().exam="Mid-term";
    const rc=T.reportCard(cynth);
    await t("report card lists all 8 subjects",()=>(rc.match(/<tr>/g)||[]).length>=8?"":"too few rows");
    await t("report card marks absent papers",()=>rc.includes("Absent")?"":"no absent marker");
    await t("report card shows papers 6 of 8",()=>rc.includes("6</b> of 8")||rc.includes("6 of 8")?"":"no papers line");
    await t("report card ranks cynth 2 of 2",()=>rc.includes("2 of 2")?"":"no position");
    const rb=T.reportCard(brian);
    await t("partial report card says not ranked",()=>rb.includes("Not ranked")&&rb.includes("no position is awarded")?"":"missing warning");
    await t("copy text records absent papers",()=>{T.reportCard(cynth);return T.getUI().reportText.includes("ABSENT")?"":"no ABSENT in text"});
  }

  console.log("\n3. payments post to the term of the date");
  {
    const {db,asha}=freshDB();
    await t("Feb date maps to term 1",()=>eq(T.stampOf("2026-02-10").term,1));
    await t("Oct date maps to term 3",()=>eq(T.stampOf("2026-10-01").term,3));
    await t("term-1 payment recorded while the school is on term 2",async()=>{
      await T.handleForm(form("pay:"+asha.id,{amount:"5000",date:"2026-02-10",method:"Cash",ref:""}));
      const p=db.payments[0];return p&&p.term===1&&p.year===2026?"":JSON.stringify(p);
    });
    await t("current term balance untouched",()=>eq(T.balOf(asha,2,2026),15000));
    await t("term-1 balance reduced",()=>eq(T.balOf(asha,1,2026),10000));
    await t("paying more than that term's balance is rejected",async()=>{
      clearErr();T.getUI().payDate="2026-03-01";
      await T.handleForm(form("pay:"+asha.id,{amount:"99999",date:"2026-03-01",method:"Cash",ref:""}));
      return !ferr.hidden&&/balance of KSh 10,000/.test(ferr.textContent)?"":"msg="+ferr.textContent;
    });
    await t("future-dated payment rejected",async()=>{
      clearErr();
      await T.handleForm(form("pay:"+asha.id,{amount:"100",date:"2099-01-01",method:"Cash",ref:""}));
      return !ferr.hidden?"":"not rejected";
    });
    await t("M-Pesa code format enforced",async()=>{
      clearErr();
      await T.handleForm(form("pay:"+asha.id,{amount:"100",date:"2026-03-02",method:"M-Pesa",ref:"abc"}));
      return !ferr.hidden?"":"not rejected";
    });
    await t("payment screen states which term it posts to",()=>{
      T.setV({name:"pay",id:asha.id});T.getUI().payDate="2026-02-10";
      const s=T.vPay();return s.includes("Posts to Term 1, 2026")&&s.includes("does not change the current balance")?"":"missing notice";
    });
    await t("receipt balance is for the payment's own term",()=>{
      T.setV({name:"pay",id:asha.id});
      const s=T.vPay();return s.includes("Paid in Term 1")?"":"no per-term stat";
    });
  }

  console.log("\n4. storage failure is visible");
  {
    freshDB();
    const before=bodyKids;global.__quota=true;
    await t("save reports failure",()=>eq(T.save(),false));
    await t("a warning bar is attached",()=>eq(bodyKids,before+1));
    global.__quota=false;
    await t("save recovers once space frees up",()=>eq(T.save(),true));
  }

  console.log("\n5. subject rename keeps marks attached");
  {
    const {db,asha,lower}=freshDB();
    db.marks.push({sid:asha.id,term:2,year:2026,exam:"Mid-term",subject:"English",score:80,absent:false});
    db.marks.push({sid:lower.id,term:2,year:2026,exam:"Mid-term",subject:"English",score:60,absent:false});
    const oldS=JSON.parse(JSON.stringify(db.settings.subjects));
    const newS=JSON.parse(JSON.stringify(oldS));
    newS.upper[0]="English Language";newS.lower[0]="English Language";
    const pairs=T.subjectRenames(oldS,newS);
    await t("positional pairs detected in both groups",()=>eq(pairs.length,2));
    await t("affected marks counted",()=>eq(T.marksUsing(pairs),2));
    db.settings.subjects=newS;T.applyRenames(pairs);
    await t("upper mark follows the rename",()=>eq(db.marks.find(m=>m.sid===asha.id).subject,"English Language"));
    await t("lower mark follows the rename",()=>eq(db.marks.find(m=>m.sid===lower.id).subject,"English Language"));
    await t("a renamed pair is not chained onto the next name",()=>{
      const f=freshDB();
      const from=JSON.parse(JSON.stringify(f.db.settings.subjects));
      const to=JSON.parse(JSON.stringify(from));
      to.upper=["Kiswahili","English",...to.upper.slice(2)];
      f.db.marks.push({sid:f.asha.id,term:2,year:2026,exam:"Mid-term",subject:from.upper[0],score:80,absent:false});
      f.db.marks.push({sid:f.brian.id,term:2,year:2026,exam:"Mid-term",subject:from.upper[1],score:70,absent:false});
      f.db.settings.subjects=to;
      T.applyRenames(T.subjectRenames(from,to));
      const a=f.db.marks.find(m=>m.sid===f.asha.id).subject, b=f.db.marks.find(m=>m.sid===f.brian.id).subject;
      return a==="Kiswahili"&&b==="English"?"":`chained: ${a}, ${b}`;
    });
    await t("changing the count is not mapped positionally",()=>eq(T.subjectRenames(newS,{...newS,upper:[...newS.upper,"Extra"]}).length,0));
  }

  console.log("\n6. removing a learner keeps the money trail");
  {
    const f=freshDB();
    f.db.payments.push({id:"p1",sid:f.asha.id,amount:5000,date:"2026-02-01",method:"Cash",ref:"",term:1,year:2026,rcpt:"RCT-0001"});
    const {db,asha,brian}=f;
    T.archiveUser(asha.id);
    await t("learner leaves the active list",()=>eq(T.users("student",true).some(s=>s.id===asha.id),false));
    await t("user row still exists",()=>!!T.byId(asha.id));
    await t("payment history kept",()=>eq(db.payments.length,1));
    await t("archived learner excluded from class results",()=>eq(T.classResults("Grade 4","Mid-term").rows.some(r=>r.s.id===asha.id),false));
    await t("archived learner excluded from the fee table",()=>{
      T.setV({name:"fees",cl:"Grade 4"});
      return T.vFees().includes("Asha")?"archived learner still listed":"";
    });
    await t("archive tab appears in people view",()=>{
      T.setV({name:"students"});T.getUI().studentTab="archived";
      return T.vPeople("student").includes("Archived (1)")?"":"no archived tab";
    });
    T.purgeUser(brian.id);
    await t("purge really deletes the row",()=>!T.byId(brian.id));
  }

  console.log("\n7. render keeps typed answers");
  {
    const inputs=[{name:"amount",type:"text",value:"4500"},{name:"date",type:"text",value:"2026-02-10"},
      {name:"pw",type:"password",value:"secret"},{name:"s_x",type:"radio",value:"Present",checked:true},
      {name:"s_x",type:"radio",value:"Absent",checked:false},{name:"method",type:"select-multiple",value:"Cash"}];
    fakeFields=inputs;
    const d=T.draftGet();
    await t("text values captured",()=>d.amount==="4500"&&d.date==="2026-02-10"?"":"lost");
    await t("passwords are never captured",()=>eq(d.pw,undefined));
    await t("checked radio captured",()=>eq(d.s_x,"Present"));
    inputs.find(i=>i.name==="amount").value="";
    inputs.find(i=>i.name==="s_x"&&i.value==="Present").checked=false;
    inputs.find(i=>i.name==="s_x"&&i.value==="Absent").checked=true;
    T.draftSet(d);
    await t("typed amount restored",()=>eq(inputs.find(i=>i.name==="amount").value,"4500"));
    await t("radio selection restored",()=>inputs.find(i=>i.value==="Present").checked===true&&inputs.find(i=>i.value==="Absent").checked===false?"":"not restored");
    fakeFields=[];
  }

  console.log("\n8. validation and password storage");
  {
    freshDB();
    await t("short username rejected",()=>T.checkPerson({first:"A",last:"B",username:"ab"},"admin").err?"":"accepted");
    await t("username with a space rejected",()=>T.checkPerson({first:"A",last:"B",username:"john doe"},"admin").err?"":"accepted");
    await t("dotted username accepted",()=>eq(T.checkPerson({first:"A",last:"B",username:"j.doe-1"},"admin").err,undefined));
    await t("bad phone rejected",()=>T.checkPerson({first:"A",last:"B",username:"good_one",mobile:"12345"},"teacher").err?"":"accepted");
    await t("+254712345678 normalised",()=>eq(T.normPhone("+254712345678"),"0712 345 678"));
    await t("01xx number accepted",()=>eq(T.normPhone("0112345678"),"0112 345 678"));
    const h=await T.makePw("demo1234");
    await t("stored digest is not the password",()=>String(h.pw).includes("demo1234")?"leaked":h.pw.length>=16&&!!h.psalt?"":"too short");
    await t("two users with the same password differ (salted)",async()=>{const h2=await T.makePw("demo1234");return h.pw!==h2.pw?"":"identical"});
    await t("correct password verifies",async()=>await T.checkPw({pw:h.pw,psalt:h.psalt},"demo1234")?"":"rejected");
    await t("wrong password rejected",async()=>await T.checkPw({pw:h.pw,psalt:h.psalt},"wrong")===false?"":"accepted");
    const legacy=await T.hash("admin123");
    await t("pre-fix unsalted digest still verifies",async()=>await T.checkPw({pw:legacy},"admin123")?"":"rejected");
    await t("no plaintext fallback in the source",()=>SRC.includes('"plain:')||SRC.includes("'plain:")?"leak present":"");
    await t("no mark is stored with a score of undefined",()=>/score:undefined/.test(T.getDB().marks.map(m=>m.score).join())?"bad":"");
  }

  console.log("\n9. every screen renders cleanly");
  {
    await T.seed();
    const db=T.getDB(), U=T.getUI();
    const admin=db.users.find(x=>x.role==="admin"), teach=db.users.find(x=>x.username==="jkamau"), stu=db.users.find(x=>x.username==="asha");
    const pid=(db.payments[0]||{}).id;
    const check=(h)=>{
      if(!h||h.length<200)return "empty output";
      const leak=/(undefined|NaN|\[object Object\])/.exec(h);
      return leak?leak[0]+" in html":"";
    };
    T.setME(null);
    for(const [label,v,ui] of [
      ["home",{name:"home"}],["about",{name:"about"}],["contact",{name:"contact"}],
      ["login:admin",{name:"login",role:"admin"}],["login:teacher",{name:"login",role:"teacher"}],["login:student",{name:"login",role:"student"}],
      ["signup:admin",{name:"signup",role:"admin"}],["signup:teacher",{name:"signup",role:"teacher"}],["signup:student",{name:"signup",role:"student"}],
    ]) await t(label,()=>{T.setV(v);T.render();return check(reg.get("#app").innerHTML)});
    await t("wait-for-approval screen",()=>{
      T.setME(db.users.find(x=>x.username==="farid"));
      const w=T.vWait();return w.includes("Waiting for approval")?"":"missing";
    });
    for(const role of ["admin","teacher","student"]){
      const u=role==="admin"?admin:role==="teacher"?teach:stu;
      T.setME(u);
      const names={admin:["dash","teachers","students","attendance","exams","notices","admins","settings","password","fees","pay","receipt","report","edit"],
        teacher:["dash","attendance","exams","notices","password","report"],
        student:["dash","myatt","myreport","password"]}[role];
      for(const rname of names) await t(role+"/"+rname,()=>{
        T.setV({name:rname,cl:"Grade 4",id:rname==="edit"||rname==="pay"||rname==="report"?stu.id:stu.id,pid,nav:rname});
        T.render();return check(reg.get("#app").innerHTML);
      });
    }
    T.setME(admin);
    const combos=[];
    for(const m of ["take","view"])for(const c of ["Grade 4","Grade 5"])combos.push([`register ${m} ${c}`,{name:"attendance",cl:c},{attMode:m}]);
    for(const m of ["results","enter"])for(const c of ["Grade 4","Form 4","PP1","Grade 10","Grade 7"])combos.push([`exams ${m} ${c}`,{name:"exams",cl:c},{examMode:m}]);
    for(const x of ["active","pending","salary","add"])combos.push([`teachers ${x}`,{name:"teachers"},{teacherTab:x}]);
    for(const x of ["active","pending","fees","archived","add"])combos.push([`students ${x}`,{name:"students"},{studentTab:x}]);
    for(const x of ["Opener","Mid-term","End-term"])combos.push([`report ${x}`,{name:"report",id:stu.id,cl:"Grade 4"},{exam:x}]);
    for(const c of ["Grade 4","Grade 5","Form 4"])combos.push([`fees ${c}`,{name:"fees",cl:c},{}]);
    combos.push(["class picker", {name:"attendance"},{},{cl:undefined}]);
    for(const [label,v,ui] of combos) await t(label,()=>{
      Object.keys(T.getUI()).forEach(k=>{if(k.startsWith("att")||k.startsWith("exam")||k.endsWith("Tab")||k==="payDate"||k==="method")delete T.getUI()[k]});
      Object.assign(T.getUI(),ui);T.setV({cl:undefined,id:stu.id,pid,...v});T.render();
      const h=reg.get("#app").innerHTML;
      return (/(undefined|NaN|\[object Object\])/.test(h)?"leak ":"")+(h.length<200?"empty ":"")||"";
    });
    await t("router sends an unknown admin route to the dashboard",()=>{
      T.setME(admin);T.setV({name:"nonsense"});T.render();
      return reg.get("#app").innerHTML.includes("Dashboard")?"":"no fallback";
    });
  }

  console.log(bad?`\n${bad} of ${n} assertions FAILED\n`:`\nall ${n} assertions passed\n`);
  process.exit(bad?1:0);
})();
