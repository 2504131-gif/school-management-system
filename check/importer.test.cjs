/* Runs the real importer end to end: fresh database, migrate, import the demo backup,
   then asserts what landed. Usage: node check/importer.test.cjs
   Needs .vendor pglite (see backend/db.js) and check/backup-demo.json (node check/make-backup.cjs). */
const fs=require("fs"), path=require("path"), {execFileSync}=require("child_process");
const NODE=process.execPath;
const ROOT=path.join(__dirname,"..");
const DATA=path.join(ROOT,"data","pg-import");
const FIX=path.join(__dirname,"backup-demo.json");
const run=(script,...a)=>execFileSync(NODE,[path.join(ROOT,"backend",script),...a],{encoding:"utf8",env:{...process.env,NODE_OPTIONS:"--no-warnings"}});

let bad=0,n=0,markCount=0;
const t=async(name,fn)=>{
  n++;let pass=false,fail="";
  try{
    const r=await fn();
    if(r===undefined||r===null)fail="the test worked out at nothing, check its assertions";
    else if(typeof r==="string"){fail=r;pass=r.length===0}
    else pass=r!==false;
  }catch(e){fail=e.message}
  if(!pass){bad++;console.log("  FAIL  "+name+(fail?"  -> "+String(fail).slice(0,160):""))}else console.log("  ok    "+name);
};
const eq=(a,b,msg)=>a===b?"":`${msg||""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;

(async()=>{
  if(!fs.existsSync(FIX))throw new Error("run node check/make-backup.cjs first");
  fs.rmSync(DATA,{recursive:true,force:true});
  console.log("migrating a fresh database...");
  run("migrate.js","--data",DATA);
  console.log("importing "+path.basename(FIX)+"...");
  const out=run("import-backup.js",FIX,"--data",DATA);
  console.log(out.replace(/^[\s\S]*?imported:/m,"imported:").split("\nAssumptions")[0].trim());

  const {open}=require(path.join(ROOT,"backend","db"));
  const db=await open({dataDir:DATA});
  const q=(sql,params)=>db.query(sql,params||[]);
  const one=async(sql,params)=>(await q(sql,params)).rows[0];
  const count=async(sql,params)=>+(await one(sql,params)).c;

  console.log("\n1. people landed and the awkward rows were handled");
  await t("every user row went in",()=>count("select count(*) c from users").then(c=>eq(c,11,"2 refused")));
  await t("no class called Grade 19",()=>count("select count(*) c from users where first_name='Kalume'").then(c=>eq(c,0)));
  await t("the second pnjoroge got a free login name",async()=>{
    const r=await one("select username from users where role='teacher' and username like 'pnjoroge%' order by username limit 2");
    return r&&r.username==="pnjoroge"?"":"first is "+(r&&r.username);
  });
  await t("its duplicate is pnjoroge-2",()=>count("select count(*) c from users where username='pnjoroge-2'").then(c=>eq(c,1)));
  await t("the unhashed password was not carried over",()=>count("select count(*) c from users where password_hash like 'blocked$%'").then(c=>eq(c,0,"that learner should not exist")));
  await t("old SHA-256 digests are kept in a recognisable form",()=>count("select count(*) c from users where password_hash like 'legacy$sha256$%'").then(c=>eq(c,11)));
  await t("bad phone left blank, good ones normalised",()=>count("select count(*) c from users where phone is not null").then(c=>eq(c,9)));
  await t("the pending teacher is still pending",async()=>{
    const r=await one("select approved from users where username='pnjoroge-2'");return r&&r.approved===false?"":"approved";
  });
  await t("salary carried over",async()=>(await one("select monthly_salary_ksh s from users where username='jkamau'")).s===48000?"":"wrong salary");

  console.log("\n2. terms, marks and positions");
  await t("marks all present",async()=>{markCount=await count("select count(*) c from marks");return eq(markCount,25)});
  await t("the unknown subject became a real subject",()=>count("select count(*) c from subjects where name='Coding' and group_code='upper'").then(c=>eq(c,1)));
  await t("the bad exam name was dropped",()=>count("select count(*) c from marks where exam='Some exam'").then(c=>eq(c,0)));
  await t("the exam is attached to the current term",async()=>{
    const r=await one("select t.number, t.year from marks m join terms t on t.id=m.term_id limit 1");
    return r.number===3&&r.year===2026?"":`${r.number} of ${r.year}`;
  });
  await t("a new subject makes every old sitting partial until it has marks",async()=>{
    const c=await count("select count(*) c from v_exam_results where complete");
    return eq(c,1,"only the learner with the new subject's mark is complete");
  });
  await t("8 of 9 papers shows as 8 offered minus 0 absent",async()=>{
    const r=await one("select offered::int o, sat::int s, expected::int e from v_exam_results where first_name='Brian'");
    return r&&r.o===9&&r.s===8&&r.e===9?"":JSON.stringify(r);
  });
  await t("so only one learner is ranked",()=>count("select count(*) c from v_exam_positions").then(c=>eq(c,1)));
  await t("asha is that learner, and first",async()=>{
    const r=await one("select first_name, position::int p, ranked_count::int rc from v_exam_positions");
    return r&&r.first_name==="Asha"&&r.p===1&&r.rc===1?"":JSON.stringify(r);
  });
  await t("entering the two missing marks completes the class",async()=>{
    const coding=(await one("select id from subjects where name='Coding'")).id;
    const term=(await one("select id from terms where year=2026 and number=3")).id;
    for(const[who,score]of[["Brian",50],["Cynthia",40]])
      await q(`insert into marks (student_id,subject_id,term_id,exam,score,absent)
        values ((select id from users where first_name=$1),$2,$3,'Mid-term',$4,false)`,[who,coding,term,score]);
    return eq(await count("select count(*) c from v_exam_positions"),3);
  });
  await t("asha still leads, now of 3",async()=>{
    const r=await one("select first_name, position::int p, ranked_count::int rc from v_exam_positions where position=1");
    return r&&r.first_name==="Asha"&&r.rc===3?"":JSON.stringify(r);
  });

  console.log("\n3. money: the wrong-term bug cannot survive the move");
  await t("every payment sits inside its own term window",async()=>{
    const c=await count(`select count(*) c from payments p join terms t on t.id=p.term_id
      where p.paid_on < t.starts_on or p.paid_on > t.ends_on`);
    return eq(c,0,"some payments are outside their term");
  });
  await t("the receipt dated 11 June went to Term 2, not Term 3",async()=>{
    const r=await one(`select t.number from payments p join terms t on t.id=p.term_id where p.receipt_no='RCT-0009'`);
    return r&&r.number===2?"":"term "+(r&&r.number);
  });
  await t("all 5 payments are stored",()=>count("select count(*) c from payments").then(c=>eq(c,5)));
  await t("receipts kept their old numbers",()=>count("select count(*) c from payments where receipt_no like 'RCT-00%'").then(c=>eq(c,5)));
  await t("the receipt sequence is past the imported numbers",async()=>{
    const r=await one("select last_value v from receipt_seq");
    return +r.v>=10?"":`next receipt would be ${r.v}`;
  });
  await t("asha owes 10,000 of the 15,000 billed this term",async()=>{
    const r=await one(`select billed::int b, paid::int p, balance::int bal from v_student_balances
      where student_id=(select id from users where username='asha') and term=3`);
    return r&&r.b===15000&&r.p===5000&&r.bal===10000?"":JSON.stringify(r);
  });
  await t("brian cleared his term",async()=>{
    const r=await one(`select balance::int bal from v_student_balances where student_id=(select id from users where username='brian') and term=3`);
    return r&&r.bal===0?"":"balance "+(r&&r.bal);
  });
  await t("a learner is never billed less than what they paid",async()=>{
    const c=await count(`select count(*) c from v_student_balances where paid>billed`);
    return eq(c,0);
  });

  console.log("\n4. the rest of the records");
  await t("attendance carried over",()=>count("select count(*) c from attendance").then(c=>eq(c,6)));
  await t("the notice is on the board",()=>count("select count(*) c from notices").then(c=>eq(c,1)));
  await t("the notice found its author by name",async()=>{
    const r=await one("select author_id is not null a from notices limit 1");return r.a?"":"no author";
  });
  await t("the valid contact message landed, the junk did not",()=>count("select count(*) c from contact_messages").then(c=>eq(c,1)));
  await t("school name came from the backup",async()=>eq((await one("select school_name n from settings where id=1")).n,"Sunrise Academy"));

  console.log("\n5. running it twice does not double anything");
  markCount=await count("select count(*) c from marks");
  const again=run("import-backup.js",FIX,"--data",DATA);
  await t("users unchanged",()=>count("select count(*) c from users").then(c=>eq(c,11)));
  await t("payments unchanged",()=>count("select count(*) c from payments").then(c=>eq(c,5)));
  await t("marks unchanged",()=>count("select count(*) c from marks").then(c=>eq(c,markCount)));
  await t("attendance unchanged",()=>count("select count(*) c from attendance").then(c=>eq(c,6)));
  await t("the second run says so in its report",()=>/already there/.test(again)?"":"report should mention what it skipped");

  await db.close();
  console.log(bad?`\n${bad} of ${n} assertions FAILED\n`:`\nall ${n} assertions passed\n`);
  process.exit(bad?1:0);
})().catch(e=>{console.error("importer test crashed:",e.message);process.exit(2)});
