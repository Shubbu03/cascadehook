import { closeCodes, subprotocol, type CreatedInbox, type ServerMessage } from "inbox/protocol";

export const inboxBaseURL = process.env.NEXT_PUBLIC_INBOX_BASE_URL?.trim().replace(/\/+$/, "") || undefined;

export type StoredInbox = Pick<CreatedInbox, "inboxId" | "url" | "token" | "expiresAt">;

const storageKey = "cascadehook.webhook-tester.v1";

export class InboxError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function isStoredInbox(value: unknown): value is StoredInbox {
  const record = value as Partial<StoredInbox> | null;
  return typeof record?.inboxId === "string" && typeof record.url === "string" && typeof record.token === "string" && typeof record.expiresAt === "number";
}

export function loadStoredInbox(): StoredInbox | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // An inbox about to expire is replaced rather than handed out.
    return isStoredInbox(parsed) && parsed.expiresAt - Date.now() > 5 * 60 * 1000 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveStoredInbox(inbox: StoredInbox | null) {
  try {
    if (inbox) window.localStorage.setItem(storageKey, JSON.stringify(inbox));
    else window.localStorage.removeItem(storageKey);
  } catch {
    // Without storage the inbox only lasts as long as this tab.
  }
}

export async function createInbox(base: string): Promise<StoredInbox> {
  let response: Response;
  try {
    response = await fetch(`${base}/_api/inboxes`, { method: "POST" });
  } catch {
    throw new InboxError("network");
  }
  if (response.status === 429) throw new InboxError("rate_limited");
  if (!response.ok) throw new InboxError("create_failed");
  const { inboxId, url, token, expiresAt } = (await response.json()) as CreatedInbox;
  return { inboxId, url, token, expiresAt };
}

export async function deleteInbox(base: string, inbox: StoredInbox) {
  try {
    await fetch(`${base}/_api/inboxes/${inbox.inboxId}`, { method: "DELETE", headers: { Authorization: `Bearer ${inbox.token}` } });
  } catch {
    // It expires on its own within 24 hours.
  }
}

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "gone";

export function connectInbox(
  base: string,
  inbox: StoredInbox,
  latestSeq: () => number,
  onMessage: (message: ServerMessage) => void,
  onStatus: (status: ConnectionStatus) => void,
) {
  let socket: WebSocket | null = null;
  let attempt = 0;
  let stopped = false;
  let retryTimer: number | undefined;
  let pingTimer: number | undefined;
  const wsBase = base.replace(/^http/, "ws");

  function open() {
    onStatus(attempt === 0 ? "connecting" : "reconnecting");
    // The token rides in the subprotocol list so it never appears in a URL.
    const current = new WebSocket(`${wsBase}/_api/inboxes/${inbox.inboxId}/live?after=${latestSeq()}`, [subprotocol, inbox.token]);
    socket = current;
    current.addEventListener("open", () => {
      attempt = 0;
      onStatus("live");
      pingTimer = window.setInterval(() => current.send("ping"), 30_000);
    });
    current.addEventListener("message", (event) => {
      if (typeof event.data !== "string" || event.data === "pong") return;
      try {
        onMessage(JSON.parse(event.data) as ServerMessage);
      } catch {
        // Ignore malformed frames.
      }
    });
    current.addEventListener("close", (event) => {
      window.clearInterval(pingTimer);
      if (stopped) return;
      if (event.code === closeCodes.gone || event.code === closeCodes.expired) {
        stopped = true;
        onStatus("gone");
        return;
      }
      attempt += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt - 1, 5));
      onStatus("reconnecting");
      retryTimer = window.setTimeout(open, delay / 2 + Math.random() * (delay / 2));
    });
  }

  open();
  return () => {
    stopped = true;
    window.clearTimeout(retryTimer);
    window.clearInterval(pingTimer);
    socket?.close(1000);
  };
}
