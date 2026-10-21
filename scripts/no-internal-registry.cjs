// Test-only preload: fail an external-consumer install if it attempts any
// connection to Replit's private network. Does not alter registry selection.
const http = require("node:http");
const https = require("node:https");

function assertPublic(input) {
  const host = typeof input === "string" || input instanceof URL
    ? new URL(input).hostname
    : String(input.hostname || input.host || "").split(":")[0];
  if (host.endsWith(".replit.internal") || host.endsWith(".replit.local")) {
    throw new Error(`External-consumer install attempted private host: ${host}`);
  }
}

for (const transport of [http, https]) {
  for (const method of ["request", "get"]) {
    const original = transport[method];
    transport[method] = function (input, ...args) {
      assertPublic(input);
      if (args[0] && typeof args[0] === "object") assertPublic(args[0]);
      return original.call(this, input, ...args);
    };
  }
}
