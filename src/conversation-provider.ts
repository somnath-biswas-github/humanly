import { createConversationModel, conversationModelSchema, conversationSystemPrompt } from "./conversation-model.js";
import type { Model } from "./conversation.js";
import { postJsonToConnector } from "./connector-http.js";
export type ProviderSelection = "openai"|"anthropic";
export const PROVIDER_CAPABILITIES = {
  openai:{structuredOutput:true,usage:"reported",cancellation:"best_effort",model:"gpt-4o-mini"},
  anthropic:{structuredOutput:true,usage:"reported",cancellation:"best_effort",model:"claude-haiku-4-5-20251001"},
} as const;
export function classifyProviderError(status?:number):"authentication"|"rate_limit"|"unavailable"|"invalid_request" {
  return status===401||status===403?"authentication":status===429?"rate_limit":status && status>=400 && status<500?"invalid_request":"unavailable";
}
export function configuredProvider(provider:ProviderSelection="openai"):Model {
  return createProvider({provider,apiKey:process.env.CONVERSATION_MODEL_API_KEY,model:process.env.CONVERSATION_MODEL,
    baseUrl:process.env.CONVERSATION_MODEL_BASE_URL,allowPrivate:process.env.CONVERSATION_MODEL_ALLOW_PRIVATE==="true"});
}
export function createProvider(config:{provider:ProviderSelection;apiKey?:string;model?:string;baseUrl?:string;allowPrivate?:boolean}):Model {
  if(config.provider==="openai")return createConversationModel(config);
  if(config.provider!=="anthropic")throw new Error("Unsupported provider");
  if(!config.apiKey && !config.allowPrivate)throw new Error("Provider key required");
  const base=new URL(config.baseUrl??"https://api.anthropic.com");
  if(base.username||base.password||base.search||base.hash||!["https:","http:"].includes(base.protocol)||
    base.protocol!=="https:"&&!config.allowPrivate)throw new Error("Invalid provider endpoint");
  const model=config.model??PROVIDER_CAPABILITIES.anthropic.model;
  return async(input,limits)=>{
    if(Buffer.byteLength(JSON.stringify(input))>512000)throw new Error("Provider input too large");
    const response=await postJsonToConnector({endpointUrl:base.toString().replace(/\/$/,"")+"/v1/messages",
      timeoutMs:limits.timeoutMs,allowPrivate:config.allowPrivate===true,
      headers:{"content-type":"application/json","anthropic-version":"2023-06-01",...(config.apiKey?{"x-api-key":config.apiKey}:{})},
      body:JSON.stringify({model,max_tokens:limits.maxOutputTokens,system:conversationSystemPrompt(input),
        messages:[{role:"user",content:JSON.stringify(input)}],
        tools:[{name:"evaluation",description:"Return the requested evaluation.",input_schema:conversationModelSchema(input)}],
        tool_choice:{type:"tool",name:"evaluation"}})});
    if(!response.ok)throw new Error("Provider "+classifyProviderError(response.status));
    const body=JSON.parse(response.body);
    const result=body.content?.filter((c:any)=>c.type==="tool_use"&&c.name==="evaluation");
    if(body.stop_reason!=="tool_use"||result?.length!==1)throw new Error("Invalid provider structured output");
    const u=body.usage;
    if(!u||![u.input_tokens,u.output_tokens].every(n=>Number.isSafeInteger(n)&&n>=0))throw new Error("Provider usage unavailable");
    return {output:result[0].input,usage:{model,promptTokens:u.input_tokens,completionTokens:u.output_tokens,totalTokens:u.input_tokens+u.output_tokens}};
  };
}
