import { exports } from "cloudflare:workers";
import { subprotocol, type CreatedInbox, type ServerMessage } from "../src/protocol";

export const origin = "https://cascadehook.com";
export const base = "https://in.example.test";

let ipCounter = 0;
// Each test gets its own client IP so rate limits don't leak between tests.
export function freshIp() {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 250}`;
}

export function call(path: string, init: RequestInit = {}) {
  return exports.default.fetch(new Request(base + path, init));
}

export async function createInbox(ip = freshIp()) {
  const response = await call("/_api/inboxes", { method: "POST", headers: { Origin: origin, "CF-Connecting-IP": ip } });
  if (response.status !== 201) throw new Error(`create failed: ${response.status}`);
  return (await response.json()) as CreatedInbox;
}

export function send(inboxId: string, init: RequestInit & { path?: string } = {}) {
  const { path = "", ...rest } = init;
  const headers = new Headers(rest.headers);
  if (!headers.has("CF-Connecting-IP")) headers.set("CF-Connecting-IP", freshIp());
  return call(`/${inboxId}${path}`, { method: "POST", ...rest, headers });
}

export type Viewer = { socket: WebSocket; messages: ServerMessage[]; closed: Promise<{ code: number }>; next: (count?: number) => Promise<ServerMessage[]> };

export async function connect(inboxId: string, token: string, after = 0, headers: Record<string, string> = {}): Promise<Viewer> {
  const response = await call(`/_api/inboxes/${inboxId}/live?after=${after}`, {
    headers: { Upgrade: "websocket", Origin: origin, "Sec-WebSocket-Protocol": `${subprotocol}, ${token}`, ...headers },
  });
  const socket = response.webSocket;
  if (!socket) throw new Error(`no websocket: ${response.status}`);
  if (response.headers.get("sec-websocket-protocol") !== subprotocol) throw new Error("subprotocol not echoed");
  const messages: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  socket.addEventListener("message", (event) => {
    messages.push(JSON.parse(event.data as string) as ServerMessage);
    for (const wake of waiters.splice(0)) wake();
  });
  const closed = new Promise<{ code: number }>((resolve) => socket.addEventListener("close", (event) => resolve({ code: event.code })));
  socket.accept();
  async function next(count = 1) {
    const deadline = Date.now() + 3000;
    while (messages.length < count) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${count} messages, got ${messages.length}`);
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
    return messages.slice(0, count);
  }
  return { socket, messages, closed, next };
}
