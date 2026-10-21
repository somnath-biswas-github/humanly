import type {Request,Response} from "express";
import {randomUUID} from "node:crypto";
import {runConversation,validateConversationDefinition,type ConversationReport,type Model,type AgentRequest} from "./conversation.js";
import type {WorkflowReply} from "./workflow.js";
import type { ProviderSelection } from "./conversation-provider.js";

export function conversationRunHandler(dependencies:{
  model:(provider?:ProviderSelection)=>Model;
  connector:(id:string)=>Promise<(request:AgentRequest)=>Promise<WorkflowReply>>;
  save:(report:ConversationReport)=>Promise<void>;
}){
  return async(req:Request,res:Response)=>{
    try{
      const {definition,connectorId,replay}=req.body??{};
      validateConversationDefinition(definition);
      if((replay!==undefined)===(connectorId!==undefined))return res.status(400).json({error:"Provide exactly one of connectorId or replay"});
      if(connectorId!==undefined&&(typeof connectorId!=="string"||!connectorId))return res.status(400).json({error:"Invalid connectorId"});
      // Resolve connection before model configuration. Caller enforces API scopes.
      const invoke=connectorId!==undefined?await dependencies.connector(connectorId):undefined;
      const report=await runConversation({definition,runId:randomUUID(),model:dependencies.model(definition.executionPlan?.provider),invoke,replay});
      await dependencies.save(report);
      return res.status(201).json(report);
    }catch{return res.status(400).json({error:"Conversation run could not be created or saved. Check the definition, connector and provider configuration."});}
  };
}
