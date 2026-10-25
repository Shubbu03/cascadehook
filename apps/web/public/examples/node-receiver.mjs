import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createReceiver } from "./receiver-core.mjs";

const receive = createReceiver({
  secret: process.env.CASCADEHOOK_SIGNING_SECRET,
  receiptsFile: process.env.RECEIPTS_FILE,
});
const port = Number(process.env.PORT ?? 9000);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("Invalid PORT.");

const server = createServer(
  { requestTimeout: 15_000, headersTimeout: 10_000 },
  async (incoming, outgoing) => {
    try {
      const headers = new Headers();
      const critical = new Set([
        "webhook-id",
        "webhook-timestamp",
        "webhook-signature",
      ]);
      const seen = new Set();
      for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
        const name = incoming.rawHeaders[i].toLowerCase();
        if (critical.has(name) && seen.has(name)) {
          outgoing.writeHead(400);
          outgoing.end("Duplicate webhook header.");
          return;
        }
        seen.add(name);
        headers.append(name, incoming.rawHeaders[i + 1]);
      }
      const bodyAllowed =
        incoming.method !== "GET" && incoming.method !== "HEAD";
      const request = new Request("http://receiver.local" + incoming.url, {
        method: incoming.method,
        headers,
        ...(bodyAllowed
          ? { body: Readable.toWeb(incoming), duplex: "half" }
          : {}),
      });
      const response = await receive(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(503);
      outgoing.end("Receiver unavailable.");
    }
  },
);

server.listen(port, process.env.HOST ?? "127.0.0.1", () => {
  console.log(
    "Receiver listening on http://127.0.0.1:" +
      server.address().port +
      "/webhooks",
  );
});
