import { createReceiver, MAX_BODY_BYTES } from "./receiver-core.mjs";

const receive = createReceiver({
  secret: process.env.CASCADEHOOK_SIGNING_SECRET,
  receiptsFile: process.env.RECEIPTS_FILE,
});
const port = Number(process.env.PORT ?? 9000);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("Invalid PORT.");

const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port,
  maxRequestBodySize: MAX_BODY_BYTES,
  idleTimeout: 15,
  fetch: receive,
});
console.log(
  "Receiver listening on http://127.0.0.1:" + server.port + "/webhooks",
);
