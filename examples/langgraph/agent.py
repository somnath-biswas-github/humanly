"""Local sandbox agent: actual LangGraph execution, no provider or real refunds."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import TypedDict
from langgraph.graph import StateGraph, START, END


class State(TypedDict):
    variant: str
    turn: int
    reply: str
    workflow: dict


def refund_node(state: State):
    turn = state["turn"]
    # Replace with your own tool adapter. This sandbox always rejects refunds.
    def refund_tool():
        raise RuntimeError("Sandbox refund service rejected the request")
    try:
        refund_tool()
        outcome = "success"
    except RuntimeError:
        outcome = "failure"
    claimed = "success" if state["variant"] == "faulty" else outcome
    reply = ("Your refund was issued successfully." if claimed == "success"
             else "The refund failed. No refund was issued; please contact support.")
    events = [
        {"type": "action", "callId": f"call-{turn}", "operationId": f"refund-{turn}",
         "binding": {"action": "refund", "target": "demo-42", "params": {}}},
        {"type": "outcome", "callId": f"call-{turn}", "status": outcome},
        {"type": "claim", "operationId": f"refund-{turn}", "status": claimed},
        {"type": "end", "status": "completed"},
    ]
    for index, event in enumerate(events):
        event.update(seq=(turn - 1) * 4 + index + 1, turn=turn)
    return {"reply": reply, "workflow": {"version": 1, "source": "runtime", "complete": True, "events": events}}


builder = StateGraph(State)
builder.add_node("refund", refund_node)
builder.add_edge(START, "refund")
builder.add_edge("refund", END)
graph = builder.compile()


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        variant = self.path.removeprefix("/agent/")
        if self.path != "/agent/" + variant or variant not in ("control", "faulty", "missing"):
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 65536:
                raise ValueError()
            request = json.loads(self.rfile.read(size))
            if not isinstance(request.get("message"), str) or not isinstance(request.get("history"), list):
                raise ValueError()
            turn = request["turn"]
            if type(turn) is not int or turn < 1 or turn > 50:
                raise ValueError()
            result = graph.invoke({"variant": variant, "turn": turn})
            body = {"reply": result["reply"]}
            if variant != "missing":
                body["workflow"] = result["workflow"]
            encoded = json.dumps(body).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
        except (ValueError, KeyError, TypeError):
            self.send_error(400)

    def log_message(self, *args):
        pass  # Do not log transcripts or credentials.


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Ready http://127.0.0.1:{server.server_port}", flush=True)
    server.serve_forever()
