import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

export const DEFAULT_MAX_CONNECTOR_RESPONSE_BYTES = 1_048_576;

export type LookupResult = { address: string; family: number };
export type LookupAll = (
  hostname: string,
) => Promise<LookupResult[]>;

export type ResolvedConnectorTarget = {
  url: URL;
  address: string;
  family: number;
};

export type ConnectorRequestOptions = {
  endpointUrl: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
  allowPrivate: boolean;
  maxResponseBytes?: number;
  lookupAll?: LookupAll;
};

export type ConnectorHttpResponse = {
  status: number;
  ok: boolean;
  body: string;
};

function normalizedHostname(hostname: string): string {
  const withoutBrackets = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return withoutBrackets.split("%")[0].toLowerCase();
}

function mappedIpv4Address(address: string): string | undefined {
  let candidate = address;
  const trailingGroup = candidate.slice(candidate.lastIndexOf(":") + 1);
  if (trailingGroup.includes(".")) {
    const octets = trailingGroup.split(".").map(Number);
    if (
      octets.length !== 4 ||
      octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
    ) {
      return undefined;
    }
    candidate = `${candidate.slice(0, candidate.lastIndexOf(":") + 1)}${
      ((octets[0] << 8) | octets[1]).toString(16)
    }:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = candidate.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  ) {
    return undefined;
  }
  const groups = [
    ...left,
    ...Array(halves.length === 2 ? missing : 0).fill("0"),
    ...right,
  ];
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))
  ) {
    return undefined;
  }
  const words = groups.map((group) => Number.parseInt(group, 16));
  if (
    words.slice(0, 5).some((word) => word !== 0) ||
    words[5] !== 0xffff
  ) {
    return undefined;
  }
  return [
    words[6] >> 8,
    words[6] & 0xff,
    words[7] >> 8,
    words[7] & 0xff,
  ].join(".");
}

export function isPrivateAddress(address: string): boolean {
  const normalized = normalizedHostname(address);
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  ) {
    return true;
  }

  const mapped = mappedIpv4Address(normalized);
  if (mapped) return isPrivateAddress(mapped);

  const parts = normalized.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [first, second, third] = parts;
  return first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224;
}

const defaultLookupAll: LookupAll = async (hostname) => {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map(({ address, family }) => ({ address, family }));
};

export async function resolveConnectorTarget(
  value: string,
  allowPrivate: boolean,
  lookupAll: LookupAll = defaultLookupAll,
): Promise<ResolvedConnectorTarget> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("endpointUrl must be a valid HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("endpointUrl must be a valid HTTP(S) URL without embedded credentials");
  }

  const hostname = normalizedHostname(url.hostname);
  if (
    !allowPrivate &&
    (hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "metadata.google.internal")
  ) {
    throw new Error(
      "Private connector targets are disabled; set HUMANLY_ALLOW_PRIVATE_CONNECTORS=true only for local development",
    );
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookupAll(hostname);
  if (!addresses.length) throw new Error("Connector hostname did not resolve");
  if (!allowPrivate && addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error(
      "Private connector targets are disabled; set HUMANLY_ALLOW_PRIVATE_CONNECTORS=true only for local development",
    );
  }

  return {
    url,
    address: normalizedHostname(addresses[0].address),
    family: addresses[0].family,
  };
}

export async function postJsonToConnector(
  options: ConnectorRequestOptions,
): Promise<ConnectorHttpResponse> {
  const target = await resolveConnectorTarget(
    options.endpointUrl,
    options.allowPrivate,
    options.lookupAll,
  );
  const maxResponseBytes = options.maxResponseBytes ??
    DEFAULT_MAX_CONNECTOR_RESPONSE_BYTES;
  const requestBody = Buffer.from(options.body);
  const requestHeaders = {
    ...options.headers,
    host: target.url.host,
    "content-length": String(requestBody.byteLength),
  };
  const transport = target.url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      callback();
    };

    const request = transport.request({
      protocol: target.url.protocol,
      hostname: target.address,
      family: target.family,
      port: target.url.port || undefined,
      path: `${target.url.pathname}${target.url.search}`,
      method: "POST",
      headers: requestHeaders,
      ...(target.url.protocol === "https:" && isIP(normalizedHostname(target.url.hostname)) === 0
        ? { servername: normalizedHostname(target.url.hostname) }
        : {}),
    }, (response) => {
      const chunks: Buffer[] = [];
      let receivedBytes = 0;

      response.on("data", (chunk: Buffer) => {
        receivedBytes += chunk.length;
        if (receivedBytes > maxResponseBytes) {
          finish(() => reject(new Error(
            `Agent response exceeded ${maxResponseBytes} bytes`,
          )));
          response.destroy();
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => finish(() => {
        const status = response.statusCode ?? 0;
        resolve({
          status,
          ok: status >= 200 && status < 300,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      }));
      response.on("error", (requestError) => finish(() => reject(requestError)));
    });

    const deadline = setTimeout(() => {
      request.destroy(new Error(
        `Agent request timed out after ${options.timeoutMs}ms`,
      ));
    }, options.timeoutMs);
    request.on("error", (requestError) => finish(() => reject(requestError)));
    request.end(requestBody);
  });
}