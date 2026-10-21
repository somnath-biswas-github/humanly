"""Wrap actual OpenAI Agents FunctionTool invocation, not model-authored traces."""
import dataclasses
import json
from .evidence import EvidenceRecorder


def instrument_function_tool(tool, recorder: EvidenceRecorder, binding):
    """Call before passing tools to Agent; bind target using actual parsed args.

    Consume run streams fully and call finish_turn only after execution ends.
    Hosted tools are unsupported: their actual backend arguments/state are unavailable.
    """
    from agents import FunctionTool
    if not isinstance(tool, FunctionTool):
        raise TypeError("Only local FunctionTool execution is supported")
    original = tool.on_invoke_tool

    async def invoke(context, raw):
        arguments = json.loads(raw)
        if not isinstance(arguments, dict):
            raise ValueError("Tool arguments must be an object")
        call_id = recorder.start_tool(tool.name, arguments, binding(tool.name, arguments))
        try:
            result = await original(context, raw)
        except BaseException:
            recorder.end_tool(call_id, "failure")
            raise
        recorder.end_tool(call_id, "success")
        return result

    # Configure function_tool(failure_error_function=None) so failures propagate,
    # rather than becoming successful-looking string return values.
    return dataclasses.replace(tool, on_invoke_tool=invoke)
