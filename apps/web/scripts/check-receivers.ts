import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fixture from "../../server/internal/signing/testdata/signing-v1.json";

const key = Buffer.from(fixture.secret.slice(6), "base64");
function signed(body: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    "Content-Type": "application/json",
    "Webhook-Id": fixture.id,
    "Webhook-Timestamp": timestamp,
    "Webhook-Signature":
      "v1," +
      createHmac("sha256", key)
        .update(fixture.id + "." + timestamp + ".")
        .update(body)
        .digest("base64"),
  };
}
const directory = await mkdtemp(join(tmpdir(), "cascadehook-receiver-smoke-"));
try {
  for (const runtime of ["node", "bun"]) {
    const receiptsFile = join(directory, runtime + ".ndjson");
    const child = Bun.spawn(
      [
        runtime,
        join(process.cwd(), "public/examples/" + runtime + "-receiver.mjs"),
      ],
      {
        env: {
          PATH: process.env.PATH,
          PORT: "0",
          CASCADEHOOK_SIGNING_SECRET: fixture.secret,
          RECEIPTS_FILE: receiptsFile,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const reader = child.stdout.getReader();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const startup = (async () => {
        let line = "";
        while (!line.includes("\n")) {
          const chunk = await reader.read();
          if (chunk.done)
            throw new Error(runtime + " receiver exited before listening.");
          line += new TextDecoder().decode(chunk.value);
        }
        const port = /127\.0\.0\.1:(\d+)\/webhooks/.exec(line)?.[1];
        if (!port) throw new Error("Receiver startup URL is missing.");
        return "http://127.0.0.1:" + port + "/webhooks";
      })();
      const url = await Promise.race([
        startup,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Receiver startup timed out.")),
            10_000,
          );
        }),
      ]);
      const challenge = JSON.stringify({
        type: "endpoint.verification",
        data: { endpoint_id: fixture.id, challenge: fixture.challenge },
      });
      const proofResponse = await fetch(url, {
        method: "POST",
        headers: signed(challenge),
        body: challenge,
        signal: AbortSignal.timeout(5000),
      });
      const proof = (await proofResponse.json()) as { proof?: string };
      if (proofResponse.status !== 200 || proof.proof !== fixture.proof)
        throw new Error(runtime + " verification proof failed.");
      const accepted = await fetch(url, {
        method: "POST",
        headers: signed(fixture.body),
        body: fixture.body,
        signal: AbortSignal.timeout(5000),
      });
      if (accepted.status !== 204)
        throw new Error(runtime + " did not accept the signed event.");
      const record = JSON.parse((await readFile(receiptsFile, "utf8")).trim());
      if (
        record.webhook_id !== fixture.id ||
        record.event.type !== "invoice.paid"
      )
        throw new Error(runtime + " receipt was not persisted.");
      const rejected = await fetch(url, {
        method: "POST",
        headers: signed(fixture.body),
        body: fixture.body + " ",
        signal: AbortSignal.timeout(5000),
      });
      if (rejected.status !== 401)
        throw new Error(runtime + " accepted a tampered event.");
      console.log(
        runtime +
          ": challenge proof, durable receipt, and tamper rejection passed.",
      );
    } finally {
      clearTimeout(timeout);
      reader.releaseLock();
      child.kill();
      await child.exited;
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
