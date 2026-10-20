/* Query layer. One interface, three backends.
   pg returns {rows, rowCount} and pglite returns the same shape, so nothing above this
   file needs to know which one is running. */
const fs=require("fs"), path=require("path"), crypto=require("crypto");

const pgliteClass=()=>require(process.env.SCHOOLHOUSE_PGLITE||
  path.join(__dirname,"..",".vendor","node_modules","@electric-sql","pglite","dist","index.cjs")).PGlite;

const wrap=q=>({
  query:(sql,params)=>q.query(sql,params||[]),
  exec:sql=>q.exec(sql),
  close:()=>(q.end?q.end():q.close()),
});

async function open(opts={}){
  const url=opts.url||process.env.DATABASE_URL;
  if(url&&/^postgres(ql)?:\/\//.test(url)){
    let Client;
    try{({Client}=require("pg"))}
    catch(e){throw new Error("DATABASE_URL points at Postgres but the pg module is missing. Run npm install pg on the server.")}
    const host=new URL(url).hostname, local=host==="localhost"||host==="127.0.0.1";
    const client=new Client({connectionString:url, ssl:local?undefined:{rejectUnauthorized:true}});
    await client.connect();
    return {kind:"postgres", ...wrap(client)};
  }
  const dir=opts.dataDir||process.env.SCHOOLHOUSE_DATA||path.join(__dirname,"..","data","pg");
  fs.mkdirSync(dir,{recursive:true});
  const db=new (pgliteClass())(dir);
  await (typeof db.waitReady==="function"?db.waitReady():db.waitReady);
  return {kind:"pglite", dir, ...wrap(db)};
}

const checksum=fs_=>crypto.createHash("sha256").update(fs_).digest("hex").slice(0,16);

/* Kenyan term windows, used when a backup references a year with no term rows. */
const iso=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
const termWindow=(year,number)=>{
  const first=[1,5,9][number-1], last=[4,8,12][number-1];
  if(!first)throw new Error(`term ${number} of ${year} is outside the 1..3 school year`);
  return{starts_on:iso(new Date(Date.UTC(year,first-1,1))), ends_on:iso(new Date(Date.UTC(year,last,0)))};
};

module.exports={open, checksum, termWindow};
