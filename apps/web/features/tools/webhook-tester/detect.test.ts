import { describe, expect, it } from "bun:test";
import { bytesToBase64, encoder, verify, type ProviderId } from "../verifier/core";
import { adapters } from "../verifier/providers";
import { decodeBase64, exactText } from "./body";
import { buildInput, detectProvider, headerMap } from "./detect";

const providers = Object.keys(adapters) as ProviderId[];

// Headers as the inbox reports them: lowercase names, values as sent.
async function capturedSample(provider: ProviderId, prefix = "") {
  const adapter = adapters[provider];
  const sample = await adapter.sample();
  const headers: [string, string][] = [["content-type", "application/json"]];
  for (const field of adapter.fields) {
    if (field.headers.length > 0) headers.push([field.headers[0]!.replace(/^webhook-/, prefix || "webhook-"), sample[field.name]]);
  }
  return { sample, headers, bodyBase64: bytesToBase64(encoder.encode(sample.body)) };
}

describe("detectProvider", () => {
  it("recognizes each provider from its headers", async () => {
    for (const provider of providers) {
      const { headers } = await capturedSample(provider);
      expect(detectProvider(headerMap(headers))).toBe(provider);
    }
  });

  it("recognizes Svix headers as Standard Webhooks", () => {
    expect(detectProvider(headerMap([["svix-signature", "v1,abc"]]))).toBe("standard-webhooks");
  });

  it("recognizes legacy GitHub SHA-1 signatures", () => {
    expect(detectProvider(headerMap([["X-Hub-Signature", "sha1=abc"]]))).toBe("github");
  });

  it("returns null when no signature header is present", () => {
    expect(detectProvider(headerMap([["content-type", "application/json"], ["authorization", "Bearer x"]]))).toBeNull();
  });
});

describe("verifying captured requests", () => {
  it("verifies every provider's sample after a round trip through the inbox encoding", async () => {
    for (const provider of providers) {
      const { sample, headers, bodyBase64 } = await capturedSample(provider);
      const text = exactText(decodeBase64(bodyBase64));
      expect(text).toBe(sample.body);
      const adapter = adapters[provider];
      const result = await verify(adapter, buildInput(adapter, headerMap(headers), text!, sample.secret));
      expect(result.status).toBe("valid");
    }
  });

  it("verifies Standard Webhooks sent with svix- header names", async () => {
    const { sample, headers, bodyBase64 } = await capturedSample("standard-webhooks", "svix-");
    expect(headers.map(([name]) => name)).toContain("svix-signature");
    const adapter = adapters["standard-webhooks"];
    const result = await verify(adapter, buildInput(adapter, headerMap(headers), exactText(decodeBase64(bodyBase64))!, sample.secret));
    expect(result.status).toBe("valid");
  });

  it("reports a changed byte as invalid", async () => {
    const { sample, headers } = await capturedSample("stripe");
    const adapter = adapters.stripe;
    const result = await verify(adapter, buildInput(adapter, headerMap(headers), sample.body.replace("4900", "4901"), sample.secret));
    expect(result.status).toBe("invalid");
  });

  it("reports the wrong secret as invalid", async () => {
    const { sample, headers } = await capturedSample("github");
    const adapter = adapters.github;
    const result = await verify(adapter, buildInput(adapter, headerMap(headers), sample.body, sample.secret + "x"));
    expect(result.status).toBe("invalid");
  });
});
