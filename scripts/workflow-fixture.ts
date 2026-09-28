/** Local, simulated, no-paid-provider fixture. Never use this as a production agent. */
import http from "node:http";
import {workflowExample} from "../src/workflow-examples.js";
const server=http.createServer((req,res)=>{
  if(req.url==="/health"){res.writeHead(200,{"content-type":"application/json"});res.end('{"status":"ok"}');return;}
  if(req.method!=="POST"||!["/fixed/v1/chat","/faulty/v1/chat"].includes(req.url??"")){res.writeHead(404);res.end();return;}
  let body="";
  req.on("data",chunk=>{body+=chunk;if(body.length>100000)req.destroy();});
  req.on("end",()=>{
    try{
      const request=JSON.parse(body),faulty=req.url!.startsWith("/faulty"),x=workflowExample(faulty);
      if(![1,2].includes(request.turn))throw new Error("turn must be 1 or 2");
      const response=request.turn===1?"Which order should I use?":faulty?"Refund complete. Please give me the order number again.":"The refund failed. No refund was completed.";
      res.writeHead(200,{"content-type":"application/json"});
      res.end(JSON.stringify({response,workflow:{...x.evidence,events:x.evidence.events.filter(e=>e.turn===request.turn)}}));
    }catch(e){res.writeHead(400,{"content-type":"application/json"});res.end(JSON.stringify({error:(e as Error).message}));}
  });
});
server.listen(Number(process.env.PORT??8099),"127.0.0.1",()=>console.log("Local workflow fixture on http://127.0.0.1:"+(process.env.PORT??8099)));