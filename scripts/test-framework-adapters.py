"""Real local framework execution, deterministic model, no provider credentials."""
import asyncio
import importlib.metadata
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages/python-sdk"))
from humanly.evidence import EvidenceRecorder
from humanly.langchain_evidence import HumanlyCallbackHandler
from humanly.openai_evidence import instrument_function_tool
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from typing import TypedDict
from agents import Agent, Model, ModelResponse, Runner, RunConfig, Usage, function_tool
from openai.types.responses import ResponseFunctionToolCall, ResponseOutputMessage, ResponseOutputText


class LocalModel(Model):
    def __init__(self):
        self.calls = 0

    async def get_response(self, *args, **kwargs):
        self.calls += 1
        output = [ResponseFunctionToolCall(type="function_call", name="lookup", arguments='{"account":"fixture"}',
                  call_id="controlled-call", id="tool1", status="completed")] if self.calls == 1 else [
            ResponseOutputMessage(type="message", id="msg1", status="completed", role="assistant",
                content=[ResponseOutputText(type="output_text", text="Complete", annotations=[])])]
        return ModelResponse(output=output, usage=Usage(), response_id=None)

    async def stream_response(self, *args, **kwargs):
        from openai.types.responses import Response, ResponseCompletedEvent, ResponseUsage
        response = await self.get_response(*args, **kwargs)
        yield ResponseCompletedEvent(type="response.completed", sequence_number=1,
            response=Response.model_construct(id="fixture-response", output=response.output,
                usage=ResponseUsage(input_tokens=0, output_tokens=0, total_tokens=0,
                    input_tokens_details={"cached_tokens":0,"cache_write_tokens":0}, output_tokens_details={"reasoning_tokens":0})))


class AdapterTests(unittest.TestCase):
    def test_emitter_redaction_approval_and_incomplete(self):
        r = EvidenceRecorder("session")
        r.begin_turn(1)
        call = r.start_tool("update", {"password":"secret-value", "nested":{"token":"s"}}, "account")
        self.assertFalse(r.snapshot()["complete"])
        r.end_tool(call, "failure")
        r.approval("trusted", {"action":"update","target":"account","params":{}}, 1)
        r.revoke("trusted")
        r.state({"balance":10})
        r.finish_turn("failed")
        self.assertNotIn("secret-value", json.dumps(r.snapshot()))
        self.assertTrue(r.snapshot()["complete"])
        self.assertEqual([e["seq"] for e in r.events], list(range(1,len(r.events)+1)))

    def test_langchain_tool_failure_and_retry(self):
        count = 0
        @tool
        def lookup(account: str) -> str:
            """Look up the controlled account."""
            nonlocal count
            count += 1
            if count == 1:
                raise ValueError("controlled failure")
            return account
        r = EvidenceRecorder("lc")
        r.begin_turn(1)
        callback = HumanlyCallbackHandler(r, lambda name,args: args["account"])
        result = lookup.with_retry(stop_after_attempt=2, wait_exponential_jitter=False).invoke(
            {"account":"fixture"}, config={"callbacks":[callback]})
        self.assertEqual(result,"fixture")
        r.finish_turn()
        outcomes=[e["status"] for e in r.events if e["type"]=="outcome"]
        self.assertEqual(outcomes,["failure","success"])
        self.assertFalse(any(e["type"]=="approval" for e in r.events))

    def test_langgraph_streams_actual_tools(self):
        class State(TypedDict):
            account: str
        @tool
        def lookup(account: str) -> str:
            """Read the local test account."""
            return account
        def node(state, config):
            return {"account":lookup.invoke({"account":state["account"]},config=config)}
        builder = StateGraph(State)
        builder.add_node("lookup",node)
        builder.add_edge(START,"lookup")
        builder.add_edge("lookup",END)
        r=EvidenceRecorder("graph")
        r.begin_turn(1)
        graph=builder.compile()
        chunks=list(graph.stream({"account":"fixture"},config={"callbacks":[HumanlyCallbackHandler(r,lambda n,a:a["account"])]}))
        self.assertTrue(chunks)
        self.assertFalse(r.snapshot()["complete"],"Stream consumption alone cannot attest host completion")
        r.finish_turn()
        self.assertTrue(r.snapshot()["complete"])
        self.assertEqual(len([e for e in r.events if e["type"]=="action"]),1)

    def test_openai_agents_actual_runner_and_stream(self):
        async def run(stream):
            @function_tool(failure_error_function=None)
            def lookup(account: str) -> str:
                """Read a local fixture."""
                return account
            r=EvidenceRecorder("agents")
            r.begin_turn(1)
            wrapped=instrument_function_tool(lookup,r,lambda n,a:a["account"])
            agent=Agent(name="fixture",model=LocalModel(),tools=[wrapped])
            if stream:
                result=Runner.run_streamed(agent,"Read fixture",run_config=RunConfig(tracing_disabled=True))
                async for _ in result.stream_events():
                    pass
            else:
                result=await Runner.run(agent,"Read fixture",run_config=RunConfig(tracing_disabled=True))
            self.assertEqual(result.final_output,"Complete")
            r.finish_turn()
            self.assertTrue(r.snapshot()["complete"])
            self.assertEqual([e["status"] for e in r.events if e["type"]=="outcome"],["success"])
        asyncio.run(run(False))
        asyncio.run(run(True))

if __name__ == "__main__":
    print(json.dumps({"layer":"local-framework","versions":{p:importlib.metadata.version(p) for p in
        ("langchain-core","langgraph","openai-agents")},"liveProvider":False}))
    unittest.main()
