#!/usr/bin/env node
/* Applies schema.sql and seed.sql once each, tracked in a migrations table.
   Usage: node backend/migrate.js [--data DIR] [--url postgres://...]
   A changed file that was already applied is reported, never re-run: later edits belong
   in a new numbered migration file so live data is never rewritten in place. */
const fs=require("fs"), path=require("path");
const {open, checksum}=require("./db");

const args=process.argv.slice(2);
const opt=name=>{const i=args.indexOf("--"+name);return i<0?null:args[i+1]};

(async()=>{
  const db=await open({dataDir:opt("data"), url:opt("url")});
  console.log(`backend: ${db.kind}${db.dir?" at "+db.dir:""}`);
  await db.exec(`create table if not exists migrations (name text primary key, applied_at timestamptz not null default now(), checksum text not null)`);
  for(const file of ["schema.sql","seed.sql"]){
    const sql=fs.readFileSync(path.join(__dirname,file),"utf8");
    const sum=checksum(sql);
    const {rows}=await db.query("select checksum from migrations where name=$1",[file]);
    if(rows.length){
      if(rows[0].checksum!==sum)console.log(`  ~  ${file} changed since it was applied (${rows[0].checksum} -> ${sum}); add a new migration instead of editing`);
      else console.log(`  =  ${file} already applied`);
      continue;
    }
    await db.exec(sql);
    await db.query("insert into migrations(name,checksum) values($1,$2)",[file,sum]);
    console.log(`  +  applied ${file}`);
  }
  const counts=await db.query(`select
    (select count(*) from classes) classes, (select count(*) from subjects) subjects,
    (select count(*) from grade_bands) bands, (select count(*) from terms) terms,
    (select school_name from settings where id=1) school`);
  console.log("  "+JSON.stringify(counts.rows[0]));
  await db.close();
})().catch(e=>{console.error("migrate failed:",e.message);process.exit(1)});
