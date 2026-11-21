# LangGraph: catch a false refund-success claim

Requires Python 3.10+ and Node.js 20+. Run from the candidate source root:

```sh
npm ci
python -m pip install -r examples/langgraph/requirements.txt
python examples/langgraph/agent.py
```

In another terminal:

```sh
npm run demo -- http://127.0.0.1:8765
```

This executes a real LangGraph `StateGraph`, a sandbox refund tool and the
supported synthetic conversation CLI. The local mock simulator/judge is for
credential-free harness verification only. See the
[report walkthrough and explicit paid live path](../../docs/behavioural-demo.md).
Automated equivalent: `npm run test:adoption`.

## Adapt your own graph

The HTTP wrapper accepts `message`, `history`, `conversationId` and one-based
`turn`; it returns `reply` plus `workflow` evidence. This tiny graph is stateless
and deliberately ignores message content: it tests one tool-error path, not
reasoning or conversational memory. For your agent, pass message/history to
your graph, scope checkpoint state to `conversationId`, and record events around
actual tools. Keep sequence numbers increasing across turns and correlate call
and operation IDs. Do not turn untrusted text into runtime evidence.

`/agent/control` truthfully reports the exception, `/agent/faulty` injects the
false success claim, and `/agent/missing` omits required evidence. These are
local test endpoints, **not production server or authentication examples**.
The server binds only to loopback. For a remote agent use HTTPS with
`CONVERSATION_AGENT_TOKEN`; never commit tokens or print request headers.
Grant private-connector access only when testing your trusted local server.

## Copyable CI gate for your agent

Run from a reviewed, pinned candidate source checkout with dependencies installed.
Configure provider credentials as repository secrets and agent URL as a variable.
Never expose provider secrets to untrusted pull-request code. This paid CI job
requires separate budget approval; it is not enabled in this repository.

```yaml
name: Agent behaviour gate
on: workflow_dispatch
permissions:
  contents: read
jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - name: Evaluate agent
        env:
          CONVERSATION_MODEL_API_KEY: ${{ secrets.CONVERSATION_MODEL_API_KEY }}
          CONVERSATION_AGENT_TOKEN: ${{ secrets.CONVERSATION_AGENT_TOKEN }}
          AGENT_URL: ${{ vars.AGENT_URL }}
        run: |
          rm -f agent-report.json
          npm run conversation -- run examples/behaviour/definition.json "$AGENT_URL" agent-report.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: humanly-report
          path: agent-report.json
          if-no-files-found: warn
          retention-days: 7
```

No `continue-on-error`, `|| true` or score-only comparison: exit **1 failure** and
**2 inconclusive/configuration/error** both fail the job. Invalid input can fail
before any report exists. Do not deploy from an `always()` step; upload reports
there only. Reports contain transcripts and should have restricted access and
appropriate retention. Review/replace the sample rubric for your own agent.
