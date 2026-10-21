import type { Model, ModelInput } from "./conversation.js";
export type LocalMetric = (input: Extract<ModelInput,{purpose:"metric"}>) => Promise<{
  score:number;applicable:boolean;exposure:"exercised"|"limited"|"not_exercised"|"unknown";reason:string;evidenceIds:string[];
}>;
/** Explicit caller-provided code only; never resolve module names from a test definition. */
export function withLocalMetrics(model:Model, plugins:Record<string,LocalMetric>):Model {
  return async(input,limits)=>{
    if(input.purpose!=="metric" || !Object.hasOwn(plugins,input.metric.id))return model(input,limits);
    const output=await plugins[input.metric.id](structuredClone(input));
    if(!output || !Number.isFinite(output.score)||typeof output.applicable!=="boolean"||!Array.isArray(output.evidenceIds)||
      !["exercised","limited","not_exercised","unknown"].includes(output.exposure)||!output.reason)
      throw new Error("Invalid local metric output");
    return {output,usage:{model:"local-metric:"+input.metric.id,promptTokens:0,completionTokens:0,totalTokens:0}};
  };
}
