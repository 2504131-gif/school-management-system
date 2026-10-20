#!/usr/bin/env node
/* Moves a browser backup (Download backup in the Admin portal) into Postgres.
   Usage: node backend/import-backup.js backup.json [--data DIR | --url postgres://...] [--dry-run]
   Reads the file, never writes to it. Run --dry-run first and read the report. */
const fs=require("fs"), path=require("path"), crypto=require("crypto");
const {open, termWindow}=require("./db");

const EXAMS=["Opener","Mid-term","End-term"];
const METHODS=["M-Pesa","Cash","Bank deposit","Cheque"];
const GROUPS=["pre","lower","upper","junior","senior","form"];
const args=process.argv.slice(2);
const opt=n=>{const i=args.indexOf("--"+n);return i<0?null:args[i+1]};
const DRY=args.includes("--dry-run");
let file=null;
for(let i=0;i<args.length;i++){if(args[i].startsWith("--")){if(args[i]==="--data"||args[i]==="--url")i++;continue}if(!file)file=args[i]}

const TODAY=new Date().toISOString().slice(0,10);
const hex64=/^[0-9a-f]{64}$/;
const clean=s=>String(s==null?"":s).trim();
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||""));
/* the browser build wrote 0712 345 678, which is the shape the schema wants back */
const normPhone=s=>{const m=clean(s).replace(/[\s\-()]/g,"").match(/^(?:\+?254|0)([17]\d{8})$/);
  return m?"0"+m[1].slice(0,3)+" "+m[1].slice(3,6)+" "+m[1].slice(6):null};
/* a payment belongs to the term its own date falls in, not the term the browser happened to be in */
const stampOf=d=>{const m=+String(d).slice(5,7);return{year:+String(d).slice(0,4),number:m<=4?1:m<=8?2:3}};
const shortError=e=>{const l=String(e.message||e).split("\n")[0];
  return l.replace(/^.*?(violates|raises|exception)/,"$1").slice(0,160)};

(async()=>{
  if(!file)throw new Error("give me the backup file: node backend/import-backup.js backup.json");
  const raw=JSON.parse(fs.readFileSync(path.resolve(file),"utf8"));
  if(!Array.isArray(raw.users))throw new Error("that file has no users array, so it is not a Schoolhouse backup");
  const db=await open({dataDir:opt("data"),url:opt("url")});
  console.log(`backend: ${db.kind}${db.dir?" at "+db.dir:""}${DRY?"  (dry run, nothing is kept)":""}`);

  const c={}, problems=[];
  const bump=k=>{c[k]=(c[k]||0)+1};
  const warn=(what,id,why)=>{if(problems.length<60)problems.push(`  !  ${what}${id?" ("+id+")":""}: ${why}`);bump("rows needing a look")};

  const q=(sql,params)=>db.query(sql,params||[]);
  const rows=(sql,params)=>q(sql,params).then(r=>r.rows);
  const one=async(sql,params)=>(await rows(sql,params))[0];
  const idOf=async(sql,params)=>{const r=await one(sql,params);return r&&r.id};
  /* one bad row must not stop the rest, and in Postgres a failed statement poisons the
     transaction, so each risky write gets its own savepoint */
  let sp=0;
  const attempt=async(what,id,fn)=>{
    const name="sp"+(++sp);
    await q("savepoint "+name);
    try{const v=await fn();await q("release savepoint "+name);return v}
    catch(e){await q("rollback to savepoint "+name);warn(what,id,shortError(e));bump("skipped");return null}
  };

  await q("begin");
  try{
    const s=raw.settings||{};
    const needTerms=new Map();
    const termFor=async(year,number)=>{
      const key=year+"/"+number;
      if(needTerms.has(key))return needTerms.get(key);
      let id=await idOf("select id from terms where year=$1 and number=$2",[year,number]);
      if(!id){
        const w=termWindow(year,number);
        id=(await q("insert into terms (year,number,starts_on,ends_on) values ($1,$2,$3,$4) returning id",
          [year,number,w.starts_on,w.ends_on])).rows[0].id;
        bump("terms created");
      }
      needTerms.set(key,id);return id;
    };
    const curYear=+s.year||+TODAY.slice(0,4);
    const curTerm=+s.term||stampOf(TODAY).number;
    const curTermId=await termFor(curYear,curTerm);
    if(clean(s.school))await q("update settings set school_name=$1, current_term_id=$2 where id=1",[clean(s.school).slice(0,80),curTermId]);
    else await q("update settings set current_term_id=$1 where id=1",[curTermId]);

    const classIds=new Map();
    for(const r of await rows("select id,name from classes"))classIds.set(r.name.toLowerCase(),r.id);

    /* people */
    const uid=new Map();  // backup id -> users.id
    const byFirst=new Map();
    const inDb=new Set((await rows("select lower(username) u from users")).map(r=>r.u));
    const taken=new Set(inDb);
    const safeName=u=>{
      let base=clean(u.username).replace(/[^A-Za-z0-9._-]/g,"").slice(0,20)||
               (clean(u.first)+clean(u.last)).replace(/[^A-Za-z0-9._-]/g,"").slice(0,20)||"learner";
      if(base.length<3)base=(base+"xxx").slice(0,3);
      let name=base,n=2;
      while(taken.has(name.toLowerCase()))name=(base.slice(0,17)+"-"+n++).slice(0,20);
      taken.add(name.toLowerCase());
      if(name!==clean(u.username))warn(u.username||"a record","",`that name was taken inside this backup, the account is now ${name}`);
      return name;
    };
    /* the browser hashed with SHA-256, so those digests are kept in a form the login path can
       recognise and the server can quietly upgrade to scrypt on the first sign in */
    const pwHash=u=>{
      const p=clean(u.pw);
      if(hex64.test(p))return"legacy$sha256$"+clean(u.psalt||"")+"$"+p;
      warn(u.username||"a record",clean(u.roll),p.startsWith("plain:")
        ?"had an unhashed password, so it was not carried over; set a new one"
        :p?"had a password hash this server does not recognise; login is blocked until an admin sets a new one"
          :"had no password at all; login is blocked until an admin sets a new one");
      return"blocked$"+crypto.randomBytes(16).toString("hex");
    };
    for(const u of raw.users){
      const role=clean(u.role);
      if(!["admin","teacher","student"].includes(role)){warn("record",u.id,"unknown role "+(clean(u.role)||"blank"));bump("skipped");continue}
      const first=clean(u.first)||clean(u.first_name), last=clean(u.last)||clean(u.last_name);
      if(!first||!last){warn(role,u.id,"no name on the record");bump("skipped");continue}
      if(inDb.has(clean(u.username).toLowerCase())){bump("people already there");continue}
      const mobile=clean(u.mobile);
      const phone=mobile?normPhone(mobile):null;
      if(mobile&&!phone)warn(u.username||role,u.id,`phone ${mobile} is not a Kenyan number, left blank`);
      let classId=null,admission=null,gender=null,guardian=null,salary=null,tsc=null;
      if(role==="student"){
        classId=classIds.get(clean(u.cl).toLowerCase());admission=clean(u.roll)||null;
        gender=clean(u.gender)||null;guardian=clean(u.guardian)||null;
        if(!classId){warn("learner "+u.username,clean(u.roll),`class ${clean(u.cl)||"blank"} is not one this school uses`);bump("skipped");continue}
        if(!admission||!gender||!guardian){warn("learner "+u.username,clean(u.roll),"admission number, gender or guardian is missing");bump("skipped");continue}
      }else if(role==="teacher"){salary=Math.max(0,Math.round(+u.salary||0));tsc=clean(u.tsc)||null}
      const who=(u.username||role)+" "+(admission||"").trim();
      const id=await attempt(who,clean(u.roll),()=>q(`insert into users (role,username,password_hash,first_name,last_name,phone,approved,archived_at,joined_on,
            class_id,admission_no,gender,guardian_name,monthly_salary_ksh,tsc_number)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
        [role,safeName(u),pwHash(u),first,last,phone,!!u.approved,u.archived?"now":null,
         isDate(u.joined)?u.joined:TODAY,classId,admission,gender,guardian,salary,tsc]).then(r=>r.rows[0].id));
      if(id==null)continue;
      uid.set(u.id,id);bump(role+"s imported");
      if(!byFirst.has(first.toLowerCase()))byFirst.set(first.toLowerCase(),id);
    }

    /* a subject name the school does not know becomes a real subject row, so marks are never dropped */
    const subIds=new Map();
    const subId=async(group,name)=>{
      const key=group+"|"+name;
      if(subIds.has(key))return subIds.get(key);
      let id=await idOf("select id from subjects where group_code=$1 and name=$2",[group,name]);
      if(!id&&GROUPS.includes(group)){
        const next=(await one("select coalesce(max(position),0)+1 n from subjects where group_code=$1 and retired_at is null",[group])).n;
        id=(await q("insert into subjects (group_code,name,position) values ($1,$2,$3) returning id",[group,name,next])).rows[0].id;
        warn("subject "+name,"","was not on the "+group+" list, added at position "+next);
      }
      subIds.set(key,id);return id;
    };
    const groupOf=async sid=>{const r=await one("select c.group_code g from users u join classes c on c.id=u.class_id where u.id=$1",[sid]);return r&&r.g};

    /* fees: history is not in the backup, so a term a learner paid into is billed at the higher
       of the current fee and what they actually paid, which keeps the over-pay guard honest */
    const pays=[],badPays=[];
    for(const p of raw.payments||[]){
      if(uid.has(p.sid)&&isDate(p.date)&&+p.amount>0)pays.push(p);else badPays.push(p);
    }
    for(const p of badPays)warn("payment "+(clean(p.rcpt)||"(no receipt)"),clean(p.sid),"no learner, no date or no amount, so it was left out");
    const paidBy=new Map();
    for(const p of pays){const st=stampOf(p.date);const k=uid.get(p.sid)+"/"+st.year+"/"+st.number;
      paidBy.set(k,(paidBy.get(k)||0)+Math.round(+p.amount))}
    for(const u of raw.users){
      const sid=uid.get(u.id);
      if(!sid||u.role!=="student")continue;
      const fee=Math.max(0,Math.round(+u.fee||0)), who="fee for "+(u.username||"learner");
      const terms=new Map([[curTermId,fee]]);
      for(const[k,amt]of paidBy){const[idStr,yr,no]=k.split("/");
        if(idStr!==String(sid))continue;
        terms.set(await termFor(+yr,+no),Math.max(fee,amt))}
      for(const[termId,amt]of terms){
        if(amt<=0)continue;
        if(await attempt(who,clean(u.roll),()=>q("insert into fee_amounts (student_id,term_id,amount_ksh) values ($1,$2,$3) on conflict (student_id,term_id) do nothing",[sid,termId,amt])))
          bump("fee rows billed");
      }
    }

    /* marks */
    for(const m of raw.marks||[]){
      const sid=uid.get(m.sid);if(!sid)continue;
      const name=clean(m.subject);
      if(!name){warn("mark",m.sid,"had no subject name");continue}
      if(!EXAMS.includes(m.exam)){warn("mark "+name,"",`exam ${clean(m.exam)||"blank"} is not Opener, Mid-term or End-term`);continue}
      const absent=!!m.absent, score=absent?null:+m.score;
      if(!absent&&(m.score==null||m.score===""||!isFinite(score))){warn("mark "+name,"","had a blank score with no absent flag");continue}
      const grp=await groupOf(sid), subject=await subId(grp,name);
      if(!subject){warn("mark "+name,"",`no ${grp} subject row could be made for it`);continue}
      const termId=await termFor(+m.year||curYear,+m.term||curTerm);
      if(await attempt("mark "+name,"",()=>q(`insert into marks (student_id,subject_id,term_id,exam,score,absent)
                 values ($1,$2,$3,$4,$5,$6) on conflict (student_id,subject_id,term_id,exam) do nothing`,
        [sid,subject,termId,m.exam,absent?null:Math.min(100,Math.max(0,score)),absent])))
        bump(absent?"absent entries":"marks");
    }

    /* payments: the term is taken from paid_on, so the wrong-term bug cannot survive the move */
    for(const p of pays){
      const st=stampOf(p.date), sid=uid.get(p.sid), rc=clean(p.rcpt);
      const who="payment "+(rc||"(new receipt)");
      const termId=await termFor(st.year,st.number);
      const method=METHODS.includes(clean(p.method))?clean(p.method):"Cash";
      const code=method==="M-Pesa"?clean(p.ref).toUpperCase().replace(/[^A-Z0-9]/g,""):"";
      const goodCode=code.length===10;
      if(method==="M-Pesa"&&!goodCode)warn(who,"",`M-Pesa code ${code||"is missing"} is not the 10 character shape, recorded as Cash`);
      const ok=await attempt(who,"",()=>q(`insert into payments (student_id,term_id,amount_ksh,paid_on,method,reference,receipt_no)
             values ($1,$2,$3,$4,$5,$6,case when $7='' then null else $7 end)`,
        [sid,termId,Math.round(+p.amount),p.date,goodCode?"M-Pesa":"Cash",goodCode?code:"",
         /^RCT-[0-9]{4,}$/.test(rc)?rc:""]).then(()=>true));
      if(!ok)continue;
      bump("payments");
      if((+p.term&&+p.term!==st.number)||(p.year&&+p.year!==st.year))
        warn(who,"",`was filed under Term ${p.term||"?"}, ${p.year||"?"} and moved to Term ${st.number} of ${st.year} to match its date`);
    }
    const used=await one("select coalesce(max(cast(substr(receipt_no,5) as int)),0) m from payments where receipt_no ~ '^RCT-[0-9]+$'");
    await q("select setval('receipt_seq', $1, false)",[+used.m+1]);

    /* attendance, notices, contact messages */
    for(const a of raw.attendance||[]){
      const sid=uid.get(a.sid);if(!sid||!isDate(a.date))continue;
      const r=await attempt("attendance "+a.date,"",()=>q("insert into attendance (student_id,taken_on,status) values ($1,$2,$3) on conflict (student_id,taken_on) do nothing",
        [sid,a.date,a.status==="Absent"?"Absent":"Present"]));
      if(r)bump(r.rowCount?"attendance days":"attendance already there");
    }
    for(const n of raw.notices||[]){
      const body=clean(n.message);if(!body)continue;
      const posted=isDate(n.date)?n.date:"";
      if(await one("select id from notices where body=$1 and posted_on=case when $2='' then current_date else $2::date end limit 1",[body.slice(0,500),posted]))
        {bump("notices already there");continue}
      if(await attempt("notice","",()=>q("insert into notices (body,posted_on,author_id) values ($1,case when $2='' then current_date else $2::date end,$3)",
        [body.slice(0,500),posted,byFirst.get(clean(n.by).toLowerCase())||null])))bump("notices");
    }
    for(const m of raw.messages||[]){
      const em=clean(m.email);
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){warn("contact message",clean(m.name),`email ${em||"blank"} is not valid, left out`);continue}
      const seenAlready=await one("select id from contact_messages where sender_email=$1 and body=$2",[em.slice(0,200),clean(m.message).slice(0,500)]);
      if(seenAlready){bump("contact messages already there");continue}
      if(await attempt("contact message",clean(m.name),()=>q("insert into contact_messages (sender_name,sender_email,body,created_at) values ($1,$2,$3,case when $4='' then now() else $4::timestamp end)",
        [clean(m.name).slice(0,60)||"Anonymous",em.slice(0,200),clean(m.message).slice(0,500),isDate(m.date)?m.date+" 09:00":""])))bump("contact messages");
    }
    if(DRY)await q("rollback");else await q("commit");
  }catch(e){
    await q("rollback");
    console.log("\nnothing was written, the import stopped part way:");
    console.log("  "+e.message.split("\n")[0]);
    await db.close();process.exit(1);
  }

  console.log("\n"+(DRY?"what a real run would write:":"imported:"));
  for(const[k,v]of Object.entries(c).sort((a,b)=>b[1]-a[1]))console.log(`  ${String(v).padStart(5)}  ${k}`);
  if(problems.length)console.log("\nneeds a look:\n"+problems.join("\n"));
  console.log("\nAssumptions: each learner was billed the current fee for the current term, and any term they had");
  console.log("already paid into was billed at the higher of that fee and what they paid. Term dates come from");
  console.log("seed.sql calendar windows, so set the real gazetted dates before trusting a balance.");
  console.log(DRY?"\nDrop --dry-run to write it.":"");
  await db.close();
})().catch(e=>{console.error("import failed:",e.message);process.exit(1)});
