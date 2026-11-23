import { DurableObject } from "cloudflare:workers";
import type { CaptureRecord } from "./capture";
import { hashToken, sameHash, tokenPattern } from "./ids";
import { limits, maxRequests, ttlMs } from "./limits";
import { closeCodes, subprotocol, type CapturedRequest, type InboxInfo, type ServerMessage } from "./protocol";

type Meta = {
  inbox_id: string;
  url: string;
  token_hash: ArrayBuffer;
  created_at: number;
  expires_at: number;
  response_status: number;
  response_type: string;
  response_body: string;
};

type Row = {
  seq: number;
  received_at: number;
  method: string;
  path: string;
  query: string;
  headers: string;
  source_ip: string | null;
  country: string | null;
  body: ArrayBuffer;
  body_size: number;
  truncated: number;
};

export type CaptureResult =
  | { status: "captured"; response: { status: number; type: string; body: string } }
  | { status: "not_found" };

const schema = [
  `CREATE TABLE meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    inbox_id TEXT NOT NULL,
    url TEXT NOT NULL,
    token_hash BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    response_status INTEGER NOT NULL DEFAULT 200 CHECK (response_status BETWEEN 200 AND 599),
    response_type TEXT NOT NULL DEFAULT 'text/plain' CHECK (response_type IN ('text/plain', 'application/json')),
    response_body TEXT NOT NULL DEFAULT 'OK' CHECK (length(response_body) <= 4096)
  )`,
  `CREATE TABLE requests (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at INTEGER NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    query TEXT NOT NULL,
    headers TEXT NOT NULL,
    source_ip TEXT,
    country TEXT,
    body BLOB NOT NULL,
    body_size INTEGER NOT NULL CHECK (body_size >= length(body)),
    truncated INTEGER NOT NULL CHECK (truncated IN (0, 1))
  )`,
];

function base64(bytes: Uint8Array) {
  let binary = "";
  // Chunked so large bodies don't overflow the argument limit of fromCharCode.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function toMessage(row: Row): CapturedRequest {
  return {
    seq: row.seq,
    receivedAt: row.received_at,
    method: row.method,
    path: row.path,
    query: row.query,
    headers: JSON.parse(row.headers) as [string, string][],
    sourceIp: row.source_ip,
    country: row.country,
    bodyBase64: base64(new Uint8Array(row.body)),
    bodySize: row.body_size,
    truncated: row.truncated === 1,
  };
}

// The second offered subprotocol carries the viewer token, which keeps it out of URLs.
function offeredToken(request: Request) {
  const offered = (request.headers.get("sec-websocket-protocol") ?? "").split(",").map((value) => value.trim());
  if (offered[0] !== subprotocol || offered.length !== 2) return null;
  return tokenPattern.test(offered[1]!) ? offered[1]! : null;
}

export class Inbox extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Answered by the runtime without waking a hibernated object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // Never runs DDL, so probing an unknown id leaves no storage behind.
  private meta(): Meta | null {
    const sql = this.ctx.storage.sql;
    if (sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'").toArray().length === 0) return null;
    const meta = sql.exec<Meta>("SELECT * FROM meta WHERE id = 1").toArray()[0];
    return meta ?? null;
  }

  // Covers an alarm that runs late: an expired inbox is wiped on first touch.
  private async live(): Promise<Meta | null> {
    const meta = this.meta();
    if (!meta) return null;
    if (Date.now() >= meta.expires_at) {
      await this.wipe("expired");
      return null;
    }
    return meta;
  }

  private info(meta: Meta): InboxInfo {
    return { id: meta.inbox_id, url: meta.url, createdAt: meta.created_at, expiresAt: meta.expires_at, ...limits };
  }

  private async wipe(reason: "expired" | "deleted") {
    const message = JSON.stringify({ type: reason } satisfies ServerMessage);
    const code = reason === "expired" ? closeCodes.expired : closeCodes.gone;
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
        socket.close(code, reason);
      } catch {
        // Already closing.
      }
    }
    await this.ctx.storage.deleteAll();
  }

  async create(inboxId: string, url: string, tokenHash: ArrayBuffer) {
    if (this.meta()) throw new Error("inbox already exists");
    const now = Date.now();
    const expiresAt = now + ttlMs;
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      for (const statement of schema) sql.exec(statement);
      sql.exec("INSERT INTO meta (id, inbox_id, url, token_hash, created_at, expires_at) VALUES (1, ?, ?, ?, ?, ?)", inboxId, url, tokenHash, now, expiresAt);
    });
    await this.ctx.storage.setAlarm(expiresAt);
    return { expiresAt };
  }

  async capture(record: CaptureRecord): Promise<CaptureResult> {
    const meta = await this.live();
    if (!meta) return { status: "not_found" };
    const sql = this.ctx.storage.sql;
    const row = sql.exec<Row>(
      `INSERT INTO requests (received_at, method, path, query, headers, source_ip, country, body, body_size, truncated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      record.receivedAt,
      record.method,
      record.path,
      record.query,
      JSON.stringify(record.headers),
      record.sourceIp,
      record.country,
      record.body.buffer.slice(record.body.byteOffset, record.body.byteOffset + record.body.byteLength),
      record.bodySize,
      record.truncated ? 1 : 0,
    ).one();
    sql.exec("DELETE FROM requests WHERE seq <= (SELECT seq FROM requests ORDER BY seq DESC LIMIT 1 OFFSET ?)", maxRequests);

    const viewers = this.ctx.getWebSockets("viewer");
    if (viewers.length > 0) {
      const message = JSON.stringify({ type: "request", request: toMessage(row) } satisfies ServerMessage);
      for (const socket of viewers) {
        try {
          socket.send(message);
        } catch {
          // A socket that is closing gets the backlog on reconnect.
        }
      }
    }
    return { status: "captured", response: { status: meta.response_status, type: meta.response_type, body: meta.response_body } };
  }

  async remove(tokenHash: ArrayBuffer) {
    const meta = await this.live();
    if (!meta || !sameHash(meta.token_hash, tokenHash)) return false;
    await this.wipe("deleted");
    return true;
  }

  async fetch(request: Request) {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const token = offeredToken(request);
    const meta = await this.live();
    const authorized = token !== null && meta !== null && sameHash(meta.token_hash, await hashToken(token));
    const headers = { "Sec-WebSocket-Protocol": subprotocol };

    // Browsers hide the status of a failed handshake, so the reason goes over the socket.
    if (!authorized || !meta) {
      server.accept();
      server.send(JSON.stringify({ type: "error", code: "inbox_not_found" } satisfies ServerMessage));
      server.close(closeCodes.gone, "inbox_not_found");
      return new Response(null, { status: 101, webSocket: client, headers });
    }

    this.ctx.acceptWebSocket(server, ["viewer"]);
    const latest = this.ctx.storage.sql.exec<{ seq: number | null }>("SELECT max(seq) AS seq FROM requests").one().seq ?? 0;
    server.send(JSON.stringify({ type: "ready", inbox: this.info(meta), latestSeq: latest } satisfies ServerMessage));
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
    const backlog = this.ctx.storage.sql.exec<Row>("SELECT * FROM requests WHERE seq > ? ORDER BY seq", Number.isSafeInteger(after) && after > 0 ? after : 0);
    for (const row of backlog) server.send(JSON.stringify({ type: "request", request: toMessage(row) } satisfies ServerMessage));
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage() {
    // Viewers only send "ping", which the auto-response handles.
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string) {
    const echo = code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code);
    try {
      socket.close(echo ? code : 1000, echo ? reason : "");
    } catch {
      // Already closed.
    }
  }

  async alarm() {
    try {
      await this.wipe("expired");
    } catch {
      // The platform stops retrying after six attempts, so reschedule explicitly.
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
    }
  }
}
