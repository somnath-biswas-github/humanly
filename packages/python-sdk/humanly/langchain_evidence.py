"""LangChain callback adapter; also works with LangGraph Runnable callbacks."""
from langchain_core.callbacks import BaseCallbackHandler
from .evidence import EvidenceRecorder


class HumanlyCallbackHandler(BaseCallbackHandler):
    raise_error = True

    def __init__(self, recorder: EvidenceRecorder, binding):
        """binding(name, arguments) returns the actual application target string."""
        self.recorder = recorder
        self.binding = binding
        self.calls = {}

    def on_tool_start(self, serialized, input_str, *, run_id, inputs=None, **kwargs):
        if not isinstance(inputs, dict):
            self.recorder.incomplete("Tool arguments unavailable; use structured tools")
            return
        name = serialized.get("name") if serialized else None
        if not name:
            self.recorder.incomplete("Tool name unavailable")
            return
        target = self.binding(name, inputs)
        self.calls[str(run_id)] = self.recorder.start_tool(name, inputs, target, call_id=str(run_id))

    def on_tool_end(self, output, *, run_id, **kwargs):
        call_id = self.calls.pop(str(run_id), None)
        if call_id:
            status = "failure" if getattr(output, "status", None) == "error" else "success"
            self.recorder.end_tool(call_id, status)

    def on_tool_error(self, error, *, run_id, **kwargs):
        call_id = self.calls.pop(str(run_id), None)
        if call_id:
            self.recorder.end_tool(call_id, "failure")

    def on_retry(self, retry_state, **kwargs):
        # A retry without a new tool-start event cannot establish exact execution counts.
        self.recorder.incomplete("Framework retry observed; verify each attempt is instrumented")
