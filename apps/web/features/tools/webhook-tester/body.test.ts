import { describe, expect, it } from "bun:test";
import { encoder } from "../verifier/core";
import { decodeBase64, exactText, formatBytes, hexDump, prettyJson } from "./body";

describe("exactText", () => {
  it("keeps a leading BOM so re-encoding gives the same bytes", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
    const text = exactText(bytes);
    expect(text).toBe("﻿{}");
    expect(encoder.encode(text!)).toEqual(bytes);
  });

  it("keeps CRLF line endings and multi-byte characters", () => {
    const bytes = encoder.encode("a\r\nb\r\n€ ✓");
    expect(encoder.encode(exactText(bytes)!)).toEqual(bytes);
  });

  it("refuses invalid UTF-8 instead of replacing it", () => {
    expect(exactText(new Uint8Array([0x7b, 0xff, 0x7d]))).toBeNull();
    expect(exactText(new Uint8Array([0xe2, 0x82]))).toBeNull();
  });
});

describe("decodeBase64", () => {
  it("decodes empty and binary bodies", () => {
    expect(decodeBase64("")).toEqual(new Uint8Array(0));
    expect(decodeBase64("AP8Q")).toEqual(new Uint8Array([0x00, 0xff, 0x10]));
  });
});

describe("formatting", () => {
  it("pretty-prints JSON and ignores other text", () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson("a=1&b=2")).toBeNull();
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(256 * 1024)).toBe("256 KB");
  });

  it("dumps binary as hex with an ASCII column", () => {
    expect(hexDump(new Uint8Array([0x41, 0x00, 0x42]))).toBe("00000000  41 00 42" + " ".repeat(39) + "  A.B");
    expect(hexDump(new Uint8Array(40), 16).split("\n").at(-1)).toBe("… 24 more bytes");
  });
});
