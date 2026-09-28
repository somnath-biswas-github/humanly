import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  isPrivateAddress,
  postJsonToConnector,
  resolveConnectorTarget,
} from "./connector-http.js";

async function localServer(
  handler: http.RequestListener,
): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return { server, url: `http://agent.invalid:${address.port}/chat` };
}

async function closeServer(server: http.Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("recognizes private, reserved, and documentation addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "198.51.100.4",
    "203.0.113.9",
    "::1",
    "fd00::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a00:1",
    "::ffff:a9fe:101",
    "0:0:0:0:0:ffff:7f00:1",
  ]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress("93.184.216.34"), false);
  assert.equal(isPrivateAddress("::ffff:5db8:d822"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

test("rejects canonicalized IPv4-mapped IPv6 URL literals", async () => {
  for (const endpointUrl of [
    "http://[::ffff:127.0.0.1]/chat",
    "http://[::ffff:10.0.0.1]/chat",
    "http://[::ffff:169.254.1.1]/chat",
  ]) {
    await assert.rejects(
      resolveConnectorTarget(endpointUrl, false),
      /Private connector targets are disabled/,
    );
  }
});

test("rejects a hostname when any resolved address is private", async () => {
  await assert.rejects(
    resolveConnectorTarget("https://agent.example/chat", false, async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
    /Private connector targets are disabled/,
  );
});

test("rejects IPv4-mapped private DNS answers", async () => {
  for (const address of [
    "::ffff:7f00:1",
    "::ffff:a00:1",
    "::ffff:a9fe:101",
  ]) {
    await assert.rejects(
      resolveConnectorTarget("https://agent.example/chat", false, async () => [
        { address: "93.184.216.34", family: 4 },
        { address, family: 6 },
      ]),
      /Private connector targets are disabled/,
    );
  }
});

test("pins the validated DNS result for the HTTP connection", async () => {
  const { server, url } = await localServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"response":"pinned"}');
  });
  let lookupCount = 0;
  try {
    const result = await postJsonToConnector({
      endpointUrl: url,
      headers: { "content-type": "application/json" },
      body: "{}",
      timeoutMs: 1_000,
      allowPrivate: true,
      lookupAll: async (hostname) => {
        lookupCount += 1;
        assert.equal(hostname, "agent.invalid");
        return [{ address: "127.0.0.1", family: 4 }];
      },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body, '{"response":"pinned"}');
    assert.equal(lookupCount, 1);
  } finally {
    await closeServer(server);
  }
});

test("keeps the timeout active after response headers arrive", async () => {
  const { server, url } = await localServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.flushHeaders();
  });
  try {
    await assert.rejects(
      postJsonToConnector({
        endpointUrl: url,
        headers: { "content-type": "application/json" },
        body: "{}",
        timeoutMs: 50,
        allowPrivate: true,
        lookupAll: async () => [{ address: "127.0.0.1", family: 4 }],
      }),
      /timed out/,
    );
  } finally {
    await closeServer(server);
  }
});

test("rejects response bodies over the configured limit", async () => {
  const { server, url } = await localServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("x".repeat(512));
  });
  try {
    await assert.rejects(
      postJsonToConnector({
        endpointUrl: url,
        headers: { "content-type": "application/json" },
        body: "{}",
        timeoutMs: 1_000,
        maxResponseBytes: 128,
        allowPrivate: true,
        lookupAll: async () => [{ address: "127.0.0.1", family: 4 }],
      }),
      /exceeded 128 bytes/,
    );
  } finally {
    await closeServer(server);
  }
});