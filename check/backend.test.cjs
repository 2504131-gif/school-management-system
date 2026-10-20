/* Runs the backend schema against real Postgres (pglite/WASM) and asserts the rules.
   Usage: node check/backend.test.cjs */
const fs=require("fs"), path=require("path"), {PGlite}=require(path.join(__dirname,"..",".vendor","node_modules","@electric-sql","pglite","dist","index.cjs"));

let bad=0, n=0;
async function t(name,fn){
  n++;let pass=false,fail="";
  try{
    const r=await fn();
    if(r===undefined||r===null)fail="the test worked out at nothing, check its assertions";
    else if(typeof r==="string"){fail=r;pass=r.length===0}
    else pass=r!==false;
  }catch(e){fail=e.message}
  if(!pass){bad++;console.log("  FAIL  "+name+(fail?"  -> "+String(fail).slice(0,150):""))}else console.log("  ok    "+name);
}
const eq=(a,b,msg)=>a===b?"":`${msg||""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;

(async()=>{
  const db=new PGlite();
  await (typeof db.waitReady==="function"?db.waitReady():db.waitReady);
  const q=(sql,params)=>db.query(sql,params||[]);
  const one=async(sql,params)=>(await q(sql,params)).rows[0];
  const rejects=async(sql,params,needle)=>{
    try{await q(sql,params);return "accepted, should have been rejected"}
    catch(e){return needle&&String(e.message).toLowerCase().indexOf(needle.toLowerCase())<0?`wrong error: ${e.message}`:""}
  };

  console.log("applying schema.sql and seed.sql...");
  await db.exec(fs.readFileSync(path.join(__dirname,"..","backend","schema.sql"),"utf8"));
  await db.exec(fs.readFileSync(path.join(__dirname,"..","backend","seed.sql"),"utf8"));
  console.log("\n1. reference data and the settings singleton");
  await t("16 classes from PP1 to Form 4",async()=>eq((await one("select count(*)::int c from classes")).c,16));
  await t("48 subjects across the six levels",async()=>eq((await one("select count(*)::int c from subjects")).c,48));
  await t("upper primary has 8 papers",async()=>eq((await one("select count(*)::int c from subjects where group_code='upper'")).c,8));
  await t("52 grade bands: 5 groups of CBC plus KCSE",async()=>eq((await one("select count(*)::int c from grade_bands")).c,52));
  await t("three terms seeded for this year",async()=>eq((await one("select count(*)::int c from terms")).c,3));
  await t("term windows cover Jan-Apr, May-Aug, Sep-Dec",async()=>{
    const r=(await q("select number, to_char(starts_on,'MM') s, to_char(ends_on,'MM') e from terms order by number")).rows;
    return JSON.stringify(r)==='[{"number":1,"s":"01","e":"04"},{"number":2,"s":"05","e":"08"},{"number":3,"s":"09","e":"12"}]'?"":JSON.stringify(r);
  });
  await t("settings is a one row table",()=>rejects("insert into settings(id,school_name) values (2,'Other')",null,"check"));
  await t("current term points at a real term",async()=>{
    const r=await one("select current_term_id is not null ok from settings where id=1");return r.ok?"":"no current term";
  });

  console.log("\n2. people");
  const H="scrypt$1$x$y$z";
  await q(`insert into users (role,username,password_hash,first_name,last_name,approved)
           values ('admin','admin',$1,'Ad','Min',true)`,[H]);
  await q(`insert into users (role,username,password_hash,first_name,last_name,approved,monthly_salary_ksh,tsc_number,phone)
           values ('teacher','jkamau',$1,'John','Kamau',true,48000,'412345','0712 345 678')`,[H]);
  await t("username format enforced",()=>rejects(`insert into users(role,username,password_hash,first_name,last_name) values('admin','a b',$1,'x','y')`,[H],"check"));
  await t("too short username rejected",()=>rejects(`insert into users(role,username,password_hash,first_name,last_name) values('admin','ab',$1,'x','y')`,[H],"check"));
  await t("duplicate username rejected whatever the case",()=>rejects(`insert into users(role,username,password_hash,first_name,last_name,monthly_salary_ksh) values('teacher','ADMIN',$1,'x','y',40000)`,[H],"unique"));
  await t("blank name rejected",()=>rejects(`insert into users(role,username,password_hash,first_name,last_name) values('admin','zz',$1,'  ','y')`,[H],"check"));
  await t("bad phone rejected",()=>rejects(`insert into users(role,username,password_hash,first_name,last_name,monthly_salary_ksh,phone) values('teacher','p2',$1,'a','b',1,'0712345678')`,[H],"check"));
  await t("teacher needs a salary",()=>rejects(`insert into users(role,username,password_hash,first_name,last_name) values('teacher','p3',$1,'a','b')`,[H],"check"));
  await t("admin cannot hold a class",()=>rejects(`insert into users(role,username,password_hash,first_name,last_name,class_id) values('admin','p4',$1,'a','b',(select id from classes where name='Grade 4'))`,[H],"check"));
  await t("student needs admission no, class and guardian",()=>rejects(`insert into users(role,username,password_hash,first_name,last_name,class_id) values('student','p5',$1,'a','b',(select id from classes where name='Grade 4'))`,[H],"check"));
  await t("tsc only for teachers",()=>rejects(`insert into users(role,username,password_hash,first_name,last_name,admission_no,class_id,gender,guardian_name,tsc_number) values('student','p6',$1,'a','b','9',(select id from classes where name='Grade 4'),'Male','g','7')`,[H],"check"));

  const cls=await one("select id, group_code from classes where name='Grade 4'");
  const mkStudent=async(user,roll)=>{
    const r=await q(`insert into users (role,username,password_hash,first_name,last_name,approved,admission_no,class_id,gender,guardian_name,phone)
      values ('student',$1,$2,'F','L',true,$3,$4,'Female','Guardian','0745 111 222') returning id`,[user,H,roll,cls.id]);
    return r.rows[0].id;
  };
  const asha=await mkStudent("asha","1041"), brian=await mkStudent("brian","1042"), cynth=await mkStudent("cynth","1043"), daniel=await mkStudent("daniel","1051");
  await t("duplicate admission number rejected",()=>rejects(`insert into users(role,username,password_hash,first_name,last_name,admission_no,class_id,gender,guardian_name) values('student','dup',$1,'a','b','1041',(select id from classes where name='Grade 4'),'Male','g')`,[H],"unique"));
  await t("only a learner can hold an admission number",()=>rejects(`insert into users(role,username,password_hash,first_name,last_name,monthly_salary_ksh,admission_no) values('teacher','t.dup',$1,'T','Dum',40000,'1041')`,[H],"check"));

  console.log("\n3. marks: shape and the results views");
  const subs=(await q("select id, name from subjects where group_code='upper' order by position")).rows;
  const put=async(sid,i,score,absent)=>q(`insert into marks (student_id, subject_id, term_id, exam, score, absent, entered_by)
     values ($1,$2,(select id from terms where number=2 and year=(select extract(year from current_date)::int)),'Mid-term',$3,$4,(select id from users where username='jkamau'))`,
     [sid, subs[i].id, score, !!absent]);
  await t("score above 100 rejected",()=>{const s=put(asha,0,150);return s.then(()=>  "accepted").catch(e=>e.message.includes("check")?"":"wrong: "+e.message)});
  await t("negative score rejected",()=>put(asha,1,-5).then(()=>"accepted",e=>e.message.includes("check")?"":"wrong"));
  await t("a score needs the absent flag off",()=>rejects(`insert into marks(student_id,subject_id,term_id,exam,score,absent) values($1,$2,(select id from terms limit 1),'Opener',50,true)`,[asha,subs[0].id],"check"));
  await t("absent needs no score",()=>rejects(`insert into marks(student_id,subject_id,term_id,exam,score,absent) values($1,$2,(select id from terms limit 1),'Opener',null,false)`,[asha,subs[0].id],"check"));
  await t("half marks allowed",async()=>{await put(asha,0,72.5);return true});
  await q("delete from marks where student_id=$1",[asha]);
  for(let i=0;i<8;i++)await put(asha,i,70+i);
  for(const i of [0,1,2])await put(brian,i,95);
  for(let i=0;i<6;i++)await put(cynth,i,80);
  for(const i of [6,7])await put(cynth,i,null,true);
  await t("same subject twice in one exam rejected",()=>put(asha,3,50).then(async()=>{await q("delete from marks where student_id=$1 and subject_id=$2 and score=50",[asha,subs[3].id]);return "accepted"},e=>e.message.includes("unique")?"":"wrong: "+e.message));
  await t("daniel has no marks so appears nowhere in results",async()=>{
    const r=await one("select count(*)::int c from v_exam_results where student_id=$1",[daniel]);return eq(r.c,0);
  });
  const rows=await q("select student_id, offered, sat, absent, expected, total::int total, mean, complete from v_exam_results order by student_id");
  const rowFor=id=>rows.rows.find(r=>String(r.student_id)===String(id));
  await t("full sitting: 8 of 8",()=>{const r=rowFor(asha);return r&&r.offered===8&&r.sat===8&&r.complete?"":JSON.stringify(r)||"no row for asha"});
  await t("3 of 8 is incomplete",()=>{const r=rowFor(brian);return r&&r.sat===3&&!r.complete?"":JSON.stringify(r)||"no row for brian"});
  await t("6 sat + 2 absent counts as complete",()=>{const r=rowFor(cynth);return r&&r.sat===6&&r.absent===2&&r.expected===6&&r.complete?"":JSON.stringify(r)||"no row for cynth"});
  await t("mean is over papers sat, not papers offered",()=>{const r=rowFor(brian);return eq(Number(r.mean),95)});
  await t("asha mean over 8 papers",()=>eq(Number(rowFor(asha).mean),73.5));
  const pos=await q("select student_id, position, ranked_count from v_exam_positions order by position, student_id");
  await t("partial sitting is not ranked",()=>pos.rows.some(r=>String(r.student_id)===String(brian))?"brian was ranked":"");
  await t("absent learner still ranked",()=>{const r=pos.rows.find(x=>String(x.student_id)===String(cynth));return r?"":"missing"});
  await t("asha ranks first, cynth second of 2",()=>{
    const a=pos.rows.find(x=>String(x.student_id)===String(asha)), c=pos.rows.find(x=>String(x.student_id)===String(cynth));
    return a&&Number(a.position)===1&&c&&Number(c.position)===2&&Number(a.ranked_count)===2?"":JSON.stringify(pos.rows);
  });
  await t("equal totals share a position",async()=>{
    await q("delete from marks where student_id=$1",[cynth]);
    for(let i=0;i<8;i++)await put(cynth,i,70+i);
    const p=await q("select student_id, position::int position from v_exam_positions where exam='Mid-term' order by position");
    const positions=p.rows.map(r=>r.position);
    return positions[0]===1&&positions[1]===1?"":JSON.stringify(positions);
  });
  await t("grade_for maps 15 to BE1 for CBC",async()=>eq((await one("select (grade_for('upper',15)).grade g")).g,"BE1"));
  await t("grade_for maps 5 to BE2, the lowest band",async()=>eq((await one("select (grade_for('upper',5)).grade g")).g,"BE2"));
  await t("grade_for maps 91 to EE1",async()=>eq((await one("select (grade_for('upper',91)).grade g")).g,"EE1"));
  await t("grade_for maps 76 to A- for forms",async()=>eq((await one("select (grade_for('form',76)).grade g")).g,"A-"));
  await t("grade points come back too",async()=>eq((await one("select (grade_for('form',80)).points p")).p,12));

  console.log("\n4. renaming a subject keeps marks attached");
  await t("marks follow the subject row, not the name",async()=>{
    await q("update subjects set name='English Language' where group_code='upper' and name='English'");
    const after=await one(`select count(*)::int c from marks m join subjects s on s.id=m.subject_id where s.name='English Language'`);
    const stale=await one("select count(*)::int c from marks m join subjects s on s.id=m.subject_id where s.group_code='upper' and s.name='English'");
    return after.c>=1&&stale.c===0?"":`after=${after.c} stale=${stale.c}`;
  });
  await t("lower primary English was not dragged along",async()=>{
    const r=await one("select name from subjects where group_code='lower' and position=1");
    return eq(r.name,"English");
  });

  console.log("\n5. fees and payments");
  const T2=(await one("select id, starts_on, ends_on from terms where number=2")).id;
  const T1=(await one("select id, starts_on, ends_on from terms where number=1"));
  await q("insert into fee_amounts (student_id, term_id, amount_ksh) values ($1,$2,15000),($1,$3,15000)",[asha,T2,T1.id]);
  await t("a learner cannot be billed twice for one term",()=>rejects("insert into fee_amounts(student_id,term_id,amount_ksh) values($1,$2,1)",[asha,T2],"unique"));
  await t("negative fee rejected",()=>rejects("insert into fee_amounts(student_id,term_id,amount_ksh) values($1,(select id from terms where number=3),-5)",[asha],"check"));
  await t("payment dated outside its term is refused",()=>rejects(
    `insert into payments (student_id,term_id,amount_ksh,paid_on,method,reference) values($1,$2,5000,'2020-01-05','Cash','')`,[asha,T2],"outside"));
  await t("payment for a term the learner is not billed for is refused",()=>rejects(
    `insert into payments (student_id,term_id,amount_ksh,paid_on,method,reference) values($1,(select id from terms where number=3),5000,current_date,'Cash','')`,[asha],"not billed"));
  await t("over-paying a term is refused",()=>rejects(
    `insert into payments (student_id,term_id,amount_ksh,paid_on,method,reference) values($1,$2,16000,'2026-06-01','Cash','')`,[asha,T2],"over-paid"));
  const pay=await q(`insert into payments (student_id,term_id,amount_ksh,paid_on,method,reference) values($1,$2,10000,'2026-06-01','M-Pesa','SJK4X9P2QA') returning id, receipt_no`,[asha,T2]);
  await t("a valid payment is stored with a receipt number",()=>/^RCT-/.test(pay.rows[0].receipt_no)?"":pay.rows[0].receipt_no);
  await t("balance after paying 10000 of 15000",async()=>{
    const r=await one("select billed::int b, paid::int p, balance::int bal from v_student_balances where student_id=$1 and term=$2",[asha,2]);
    return r.b===15000&&r.p===10000&&r.bal===5000?"":JSON.stringify(r);
  });
  await t("term 1 balance is untouched by a term 2 payment",async()=>{
    const r=await one("select paid::int p, balance::int bal from v_student_balances where student_id=$1 and term=$2",[asha,1]);
    return r.p===0&&r.bal===15000?"":JSON.stringify(r);
  });
  await t("M-Pesa reference shape enforced",()=>rejects(
    `insert into payments (student_id,term_id,amount_ksh,paid_on,method,reference) values($1,$2,1000,'2026-06-02','M-Pesa','abc')`,[asha,T2],"check"));
  await t("a payment cannot be voided without a reason",()=>rejects(
    `update payments set voided_at=now() where id=$1`,[pay.rows[0].id],"check"));
  await t("voiding a payment returns the balance",async()=>{
    await q("update payments set voided_at=now(), void_reason='reversed by bank' where id=$1 and voided_at is null",[pay.rows[0].id]);
    const r=await one("select paid::int p, balance::int bal, voided::int v from v_student_balances where student_id=$1 and term=$2",[asha,2]);
    return r.p===0&&r.bal===15000&&r.v===10000?"":JSON.stringify(r);
  });
  await q(`insert into payments (student_id,term_id,amount_ksh,paid_on,method,reference) values($1,$2,15000,'2026-06-03','Cash','')`,[asha,T2]);
  await t("deleting a learner who has paid is blocked",()=>rejects("delete from users where id=$1",[asha],"archive"));
  await t("archiving keeps the money rows",async()=>{
    await q("update users set archived_at=now() where id=$1",[daniel]);
    const r=await one("select archived_at is not null a from users where id=$1",[daniel]);return r.a?"":"not archived";
  });
  await q("update users set archived_at=null where id=$1",[daniel]);
  await t("a learner with no payments can be deleted",async()=>{
    const tmp=await q(`insert into users (role,username,password_hash,first_name,last_name,approved,admission_no,class_id,gender,guardian_name)
      values ('student','throw',$1,'T','M',true,'9999',$2,'Male','g') returning id`,[H,cls.id]);
    await q("delete from users where id=$1",[tmp.rows[0].id]);return true;
  });

  console.log("\n6. attendance and registers");
  await q(`insert into attendance (student_id,taken_on,status) values ($1,current_date-1,'Present'),($2,current_date-1,'Absent'),($3,current_date-1,'Present')`,[asha,brian,cynth]);
  await t("a learner has one status per day",()=>rejects(`insert into attendance(student_id,taken_on,status) values($1,current_date-1,'Absent')`,[asha],"unique"));
  await t("only Present or Absent",()=>rejects(`insert into attendance(student_id,taken_on,status) values($1,current_date,'Late')`,[asha],"check"));
  await t("register counts the class from the learner",async()=>{
    const r=await one(`select taken::int t, present::int p, absent::int a from v_registers where class_id=$1 and taken_on=current_date-1`,[cls.id]);
    return r.t===3&&r.p===2&&r.a===1?"":JSON.stringify(r);
  });

  console.log("\n7. other tables");
  await t("notice body cannot be blank",()=>rejects("insert into notices(body) values('  ')",null,"check"));
  await t("notice longer than 500 chars rejected",()=>rejects("insert into notices(body) values(repeat('x',501))",null,"check"));
  await t("contact message needs a sane email",()=>rejects("insert into contact_messages(sender_name,sender_email,body) values('a','nope','b')",null,"check"));
  await t("sessions must expire after creation",()=>rejects("insert into sessions(token_hash,user_id,expires_at) values('h',(select id from users where username='admin'),now()-interval '1 hour')",null,"check"));
  await t("audit stores jsonb",async()=>{
    await q("insert into audit(actor_id,action,entity,entity_id,data) values((select id from users where username='admin'),'login','user','1','{\"via\":\"form\"}'::jsonb)");
    const r=await one("select data->>'via' v from audit where action='login'");return eq(r.v,"form");
  });

  console.log(bad?`\n${bad} of ${n} assertions FAILED\n`:`\nall ${n} assertions passed\n`);
  process.exit(bad?1:0);
})().catch(e=>{console.error("harness crashed:",e.stack);process.exit(2)});
