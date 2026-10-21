import {readFile} from "node:fs/promises";
import {summarizeReport,compareSummaries,safeSummary} from "./report-summary.js";
async function main(){
  const [command,path,baseline]=process.argv.slice(2);
  if(!path||!["inspect","diagnostic","compare"].includes(command))throw Error("Usage: report-cli inspect|diagnostic report.json | compare baseline.json report.json");
  const summary=summarizeReport(JSON.parse(await readFile(path,"utf8")));
  if(command==="compare"){
    if(!baseline)throw Error("Second report required");
    const comparison=compareSummaries(summary,summarizeReport(JSON.parse(await readFile(baseline,"utf8"))));
    console.log(JSON.stringify(comparison,null,2));process.exitCode=comparison.comparable?0:2;
  }else console.log(JSON.stringify(command==="diagnostic"?safeSummary(summary):summary,null,2));
}
main().catch(()=>{console.error("Report inspection failed; unsupported or malformed saved report. No evaluation was run.");process.exitCode=2;});
