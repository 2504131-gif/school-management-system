/* Writes a browser-style backup JSON from app.js demo data, for testing the importer.
   Usage: node check/make-backup.cjs [out.json] */
const fs=require("fs");
const store=new Map();
global.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const el=()=>({value:"",hidden:true,textContent:"",innerHTML:"",dataset:{},style:{},files:null,
  appendChild(){},remove(){},focus(){},reset(){},closest(){return null},querySelector(){return el()},
  querySelectorAll(){return[]},addEventListener(){},classList:{add(){},remove(){}}});
const reg=new Map();
global.document={title:"",body:{appendChild(){}},createElement:()=>el(),addEventListener(){},
  documentElement:{dataset:{}},querySelectorAll:()=>[],querySelector:s=>{if(!reg.has(s))reg.set(s,el());return reg.get(s)}};
global.window={addEventListener(){},scrollTo(){}};
global.matchMedia=()=>({matches:false});
global.navigator={};
global.FormData=class{constructor(f){this.f=f}entries(){return Object.entries(this.f.__fields||{})}};

const SRC=fs.readFileSync(process.env.APP||"app.js","utf8");
(0,eval)(SRC+"\n;globalThis.__B={seed,getDB:()=>DB};");
const out=process.argv[2]||"check/backup-demo.json";
(async()=>{
  await new Promise(r=>setTimeout(r,300));              // let the app's own boot finish
  if(!globalThis.__B.getDB())await globalThis.__B.seed();
  const d=globalThis.__B.getDB();
  /* awkward rows on purpose, so the importer's normalising paths get exercised */
  d.users.push({id:"u-badphone",role:"teacher",username:"pnjoroge",pw:"0".repeat(64),first:"Peter",last:"Njoroge",
    mobile:"073456",joined:"2026-01-09",approved:false,tsc:"",salary:45000});
  d.users.push({id:"u-nocls",role:"student",username:"kalume",pw:"0".repeat(63)+"a",first:"Kalume",last:"M",
    roll:"1099",cl:"Grade 19",gender:"Male",guardian:"G",fee:15000,joined:"2026-01-09",approved:false});
  d.users.push({id:"u-plain",role:"student",username:"sha",pw:"plain:demo1234",first:"Asha",last:"M",
    roll:"1041",cl:"Grade 4",gender:"Female",guardian:"G",fee:15000,joined:"2026-01-09",approved:true});
  d.marks.push({sid:d.users[4].id,term:d.settings.term,year:d.settings.year,exam:"Mid-term",subject:"Coding",score:61,absent:false});
  d.marks.push({sid:d.users[4].id,term:d.settings.term,year:d.settings.year,exam:"Some exam",subject:"English",score:61,absent:false});
  d.payments.push({id:"p-bad",sid:d.users[4].id,amount:3000,date:"2026-06-11",method:"M-Pesa",ref:"xy",term:3,year:2026,rcpt:"RCT-0009"});
  d.messages.push({id:"m1",date:"2026-06-02",name:"Jane",email:"jane@example.com",message:"Question about Grade 4 fees"});
  d.messages.push({id:"m2",date:"2026-06-03",name:"Bot",email:"not-an-email",message:"spam"});
  fs.writeFileSync(out,JSON.stringify(d,null,1));
  console.log(out+": "+[["users",d.users],["marks",d.marks],["payments",d.payments],["attendance",d.attendance],
    ["notices",d.notices],["messages",d.messages]].map(([k,v])=>v.length+" "+k).join(", "));
})().catch(e=>{console.error("backup fixture failed:",e.message);process.exit(1)});
