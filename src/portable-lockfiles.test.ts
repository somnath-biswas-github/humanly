import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";

test("all OSS lockfiles reject both private registry suffixes and retain pinned integrity on repair",()=>{
  const dir=mkdtempSync(join(tmpdir(),"oss-portable-"));
  try{
    mkdirSync(join(dir,"scripts"));
    copyFileSync("scripts/portable-lockfiles.mjs",join(dir,"scripts/portable-lockfiles.mjs"));
    const files=["package-lock.json","packages/sdk/package-lock.json","packages/cli/package-lock.json"];
    for(const name of files){
      const path=join(dir,name);mkdirSync(join(path,".."),{recursive:true});
      writeFileSync(path,JSON.stringify({packages:{
        "node_modules/a":{version:"1.0.0",integrity:"sha512-fixture",resolved:"http://package-firewall.replit.local/npm/a/-/a-1.0.0.tgz"},
        "node_modules/b":{version:"2.0.0",integrity:"sha512-other",resolved:"https://package-firewall.replit.internal/npm/b/-/b-2.0.0.tgz"}}}));
    }
    const run=(args:string[])=>spawnSync(process.execPath,[join(dir,"scripts/portable-lockfiles.mjs"),...args],{encoding:"utf8"});
    assert.equal(run(["--check"]).status,1);
    assert.equal(run([]).status,0);
    assert.equal(run(["--check"]).status,0);
    for(const name of files){const lock=JSON.parse(readFileSync(join(dir,name),"utf8"));
      assert.deepEqual(lock.packages["node_modules/a"],{version:"1.0.0",integrity:"sha512-fixture",resolved:"https://registry.npmjs.org/a/-/a-1.0.0.tgz"});
      assert.equal(lock.packages["node_modules/b"].resolved,"https://registry.npmjs.org/b/-/b-2.0.0.tgz");
      assert.equal(lock.packages["node_modules/b"].integrity,"sha512-other");
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
