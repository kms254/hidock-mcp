import { describe, it, expect } from "vitest";
import {
  toBCD,
  fromBCD,
  encodeFrame,
  decodeFrame,
  parseDeviceInfo,
  parseVersionInfo,
  parseTime,
  parseFileCount,
  parseCardInfo,
  parseSettings,
  parseCommandResult,
  parseDeleteFile,
  parseFirmwareUpgrade,
  parseUacUpdate,
  parseFileList,
  parseResponse,
  formatDateForDevice,
  buildSettingsPayload,
} from "../src/protocol.js";
import { CommandId } from "../src/types.js";

describe("BCD encoding", () => {
  it("encodes a digit string to BCD bytes", () => {
    expect(toBCD("20260303")).toEqual([0x20, 0x26, 0x03, 0x03]);
  });

  it("encodes time string to BCD", () => {
    expect(toBCD("20260303143025")).toEqual([0x20, 0x26, 0x03, 0x03, 0x14, 0x30, 0x25]);
  });

  it("decodes BCD bytes back to digit string", () => {
    expect(fromBCD(0x20, 0x26, 0x03, 0x03)).toBe("20260303");
  });

  it("round-trips correctly", () => {
    const original = "20260303143025";
    expect(fromBCD(...toBCD(original))).toBe(original);
  });
});

describe("encodeFrame", () => {
  it("encodes a frame with no body", () => {
    const frame = encodeFrame(0x01, 1);
    expect(frame.length).toBe(12);
    expect(frame[0]).toBe(0x12);
    expect(frame[1]).toBe(0x34);
    // command id = 0x0001
    expect(frame[2]).toBe(0x00);
    expect(frame[3]).toBe(0x01);
    // sequence = 1
    expect(frame[4]).toBe(0x00);
    expect(frame[5]).toBe(0x00);
    expect(frame[6]).toBe(0x00);
    expect(frame[7]).toBe(0x01);
    // body length = 0
    expect(frame[8]).toBe(0x00);
    expect(frame[9]).toBe(0x00);
    expect(frame[10]).toBe(0x00);
    expect(frame[11]).toBe(0x00);
  });

  it("encodes a frame with body bytes", () => {
    const frame = encodeFrame(0x11, 42, [0x01, 0x02, 0x03, 0x04]);
    expect(frame.length).toBe(16);
    // command = FORMAT_CARD
    expect(frame[2]).toBe(0x00);
    expect(frame[3]).toBe(0x11);
    // sequence = 42
    expect(frame[7]).toBe(42);
    // body length = 4
    expect(frame[11]).toBe(0x04);
    // body
    expect(frame[12]).toBe(0x01);
    expect(frame[13]).toBe(0x02);
    expect(frame[14]).toBe(0x03);
    expect(frame[15]).toBe(0x04);
  });

  it("accepts Uint8Array body", () => {
    const body = new Uint8Array([0xaa, 0xbb]);
    const frame = encodeFrame(0x05, 1, body);
    expect(frame.length).toBe(14);
    expect(frame[12]).toBe(0xaa);
    expect(frame[13]).toBe(0xbb);
  });
});

describe("decodeFrame", () => {
  it("returns null for incomplete buffer", () => {
    expect(decodeFrame([0x12, 0x34, 0x00])).toBeNull();
  });

  it("returns null when body not fully received", () => {
    // header says body length = 4, but only 2 bytes present
    const buf = [
      0x12, 0x34, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x04, 0xaa, 0xbb,
    ];
    expect(decodeFrame(buf)).toBeNull();
  });

  it("throws on invalid header", () => {
    const buf = [0xff, 0xff, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00];
    expect(() => decodeFrame(buf)).toThrow("Invalid frame header");
  });

  it("decodes a frame with no body", () => {
    const buf = [0x12, 0x34, 0x00, 0x01, 0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00];
    const result = decodeFrame(buf);
    expect(result).not.toBeNull();
    expect(result!.frame.commandId).toBe(0x01);
    expect(result!.frame.sequence).toBe(5);
    expect(result!.frame.bodyLength).toBe(0);
    expect(result!.frame.body).toEqual([]);
    expect(result!.consumed).toBe(12);
  });

  it("decodes a frame with body", () => {
    const buf = [
      0x12, 0x34, 0x00, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x03, 0xaa, 0xbb, 0xcc,
    ];
    const result = decodeFrame(buf);
    expect(result).not.toBeNull();
    expect(result!.frame.commandId).toBe(0x10);
    expect(result!.frame.body).toEqual([0xaa, 0xbb, 0xcc]);
    expect(result!.consumed).toBe(15);
  });

  it("round-trips with encodeFrame", () => {
    const encoded = encodeFrame(CommandId.QueryDeviceInfo, 7, [0x01, 0x02]);
    const decoded = decodeFrame(Array.from(encoded));
    expect(decoded).not.toBeNull();
    expect(decoded!.frame.commandId).toBe(CommandId.QueryDeviceInfo);
    expect(decoded!.frame.sequence).toBe(7);
    expect(decoded!.frame.body).toEqual([0x01, 0x02]);
  });

  it("handles padding in length field", () => {
    // padding = 2 in high byte, body length = 3
    const buf = [
      0x12,
      0x34,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x01,
      0x02,
      0x00,
      0x00,
      0x03,
      0xaa,
      0xbb,
      0xcc, // body (3 bytes)
      0x00,
      0x00, // padding (2 bytes)
    ];
    const result = decodeFrame(buf);
    expect(result).not.toBeNull();
    expect(result!.frame.padding).toBe(2);
    expect(result!.frame.bodyLength).toBe(3);
    expect(result!.frame.body).toEqual([0xaa, 0xbb, 0xcc]);
    expect(result!.consumed).toBe(17);
  });
});

describe("parseDeviceInfo", () => {
  it("parses version code and serial number", () => {
    // version bytes: [0x00, 0x05, 0x02, 0x04] → "5.2.4", vn = 328196
    // SN: "HDH1TEST000001" padded to 16 bytes
    const sn = "HDH1TEST000001";
    const body = [0x00, 0x05, 0x02, 0x04];
    for (let i = 0; i < 16; i++) {
      body.push(i < sn.length ? sn.charCodeAt(i) : 0);
    }
    const info = parseDeviceInfo(body);
    expect(info.versionCode).toBe("5.2.4");
    expect(info.versionNumber).toBe(0x00050204);
    expect(info.sn).toBe("HDH1TEST000001");
  });
});

describe("parseVersionInfo", () => {
  it("parses all version groups", () => {
    // 7 groups of 4 bytes each
    const body = [
      0,
      5,
      2,
      4, // bluetooth
      0,
      5,
      1,
      16, // dsp
      0,
      1,
      0,
      7, // uac
      0x23,
      0x09,
      0x27,
      0x21, // igd
      0x24,
      0x06,
      0x17,
      0x16, // igu
      0,
      0,
      0,
      0, // earphone
      0,
      0,
      0,
      0, // base
    ];
    const info = parseVersionInfo(body);
    expect(info.bluetooth).toBe("0.5.2.4");
    expect(info.dsp).toBe("0.5.1.16");
    expect(info.uac).toBe("0.1.0.7");
    expect(info.earphone).toBe("0.0.0.0");
    expect(info.base).toBe("0.0.0.0");
  });

  it("returns None for missing groups", () => {
    const body = [0, 1, 0, 0]; // only bluetooth
    const info = parseVersionInfo(body);
    expect(info.bluetooth).toBe("0.1.0.0");
    expect(info.dsp).toBe("None");
  });
});

describe("parseTime", () => {
  it("parses BCD-encoded time", () => {
    const body = [0x20, 0x26, 0x03, 0x03, 0x14, 0x30, 0x25];
    const result = parseTime(body);
    expect(result.time).toBe("2026-03-03 14:30:25");
  });

  it("returns unknown for all-zero time", () => {
    const body = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    expect(parseTime(body).time).toBe("unknown");
  });
});

describe("parseFileCount", () => {
  it("parses a 4-byte big-endian count", () => {
    expect(parseFileCount([0x00, 0x00, 0x00, 0x05]).count).toBe(5);
    expect(parseFileCount([0x00, 0x00, 0x01, 0x00]).count).toBe(256);
    expect(parseFileCount([0x00, 0x00, 0x00, 0x00]).count).toBe(0);
  });
});

describe("parseCardInfo", () => {
  it("parses used, capacity, and status", () => {
    // used = 7616, capacity = 29952, status = 0x400e00
    const body = [
      0x00,
      0x00,
      0x1d,
      0xc0, // 7616
      0x00,
      0x00,
      0x75,
      0x00, // 29952
      0x00,
      0x40,
      0x0e,
      0x00, // 0x400e00
    ];
    const info = parseCardInfo(body);
    expect(info.used).toBe(7616);
    expect(info.capacity).toBe(29952);
    expect(info.status).toBe("400e00");
  });

  it("parses a healthy card with zero status", () => {
    const body = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x75, 0x00, 0x00, 0x00, 0x00, 0x00];
    const info = parseCardInfo(body);
    expect(info.used).toBe(0);
    expect(info.status).toBe("0");
  });
});

describe("parseSettings", () => {
  it("parses all three settings", () => {
    const body = new Array(12).fill(0);
    body[3] = 1; // autoRecord on
    body[7] = 2; // autoPlay off
    body[11] = 1; // notification on
    const settings = parseSettings(body);
    expect(settings.autoRecord).toBe(true);
    expect(settings.autoPlay).toBe(false);
    expect(settings.notification).toBe(true);
  });
});

describe("parseCommandResult", () => {
  it("returns success for 0x00", () => {
    const result = parseCommandResult([0x00]);
    expect(result.result).toBe("success");
    expect(result.rawCode).toBe(0);
  });

  it("returns failed with raw code for non-zero", () => {
    const result = parseCommandResult([0x01]);
    expect(result.result).toBe("failed");
    expect(result.rawCode).toBe(1);
    expect(result.rawBody).toBe("01");
  });

  it("includes full raw body for multi-byte responses", () => {
    const result = parseCommandResult([0x02, 0xff, 0x10]);
    expect(result.rawBody).toBe("02 ff 10");
  });
});

describe("parseDeleteFile", () => {
  it("parses success", () => {
    expect(parseDeleteFile([0x00]).result).toBe("success");
  });

  it("parses not-exists", () => {
    expect(parseDeleteFile([0x01]).result).toBe("not-exists");
  });

  it("parses failed", () => {
    expect(parseDeleteFile([0x02]).result).toBe("failed");
  });
});

describe("parseFirmwareUpgrade", () => {
  it("parses all result codes", () => {
    expect(parseFirmwareUpgrade([0x00]).result).toBe("accepted");
    expect(parseFirmwareUpgrade([0x01]).result).toBe("wrong-version");
    expect(parseFirmwareUpgrade([0x02]).result).toBe("busy");
    expect(parseFirmwareUpgrade([0x03]).result).toBe("unknown");
  });
});

describe("parseUacUpdate", () => {
  it("parses known codes", () => {
    expect(parseUacUpdate([0x00])).toEqual({ code: 0, result: "success" });
    expect(parseUacUpdate([0x01])).toEqual({ code: 1, result: "length-mismatch" });
    expect(parseUacUpdate([0x02])).toEqual({ code: 2, result: "busy" });
    expect(parseUacUpdate([0x03])).toEqual({ code: 3, result: "card-full" });
    expect(parseUacUpdate([0x04])).toEqual({ code: 4, result: "card-error" });
  });

  it("returns numeric string for unknown codes", () => {
    expect(parseUacUpdate([0x99])).toEqual({ code: 0x99, result: "153" });
  });
});

describe("parseResponse dispatch", () => {
  it("dispatches QueryDeviceInfo correctly", () => {
    const sn = "HDH1TEST123456";
    const body = [0x00, 0x01, 0x00, 0x00];
    for (let i = 0; i < 16; i++) body.push(i < sn.length ? sn.charCodeAt(i) : 0);
    const resp = parseResponse(CommandId.QueryDeviceInfo, body);
    expect(resp.type).toBe("deviceInfo");
  });

  it("dispatches ReadCardInfo correctly", () => {
    const body = new Array(12).fill(0);
    const resp = parseResponse(CommandId.ReadCardInfo, body);
    expect(resp.type).toBe("cardInfo");
  });

  it("dispatches FormatCard as commandResult", () => {
    const resp = parseResponse(CommandId.FormatCard, [0x01]);
    expect(resp.type).toBe("commandResult");
  });

  it("returns unknown for unrecognized command IDs", () => {
    const resp = parseResponse(0xffff, [0x01, 0x02]);
    expect(resp.type).toBe("unknown");
  });
});

describe("formatDateForDevice", () => {
  it("converts a Date to BCD bytes", () => {
    const date = new Date(2026, 2, 3, 14, 30, 25); // March = month 2 (0-indexed)
    const bcd = formatDateForDevice(date);
    expect(fromBCD(...bcd)).toBe("20260303143025");
  });
});

describe("buildSettingsPayload", () => {
  it("builds a 12-byte array with defaults as zero", () => {
    const payload = buildSettingsPayload({});
    expect(payload).toHaveLength(12);
    expect(payload.every((b) => b === 0)).toBe(true);
  });

  it("sets autoRecord at index 3", () => {
    expect(buildSettingsPayload({ autoRecord: true })[3]).toBe(1);
    expect(buildSettingsPayload({ autoRecord: false })[3]).toBe(2);
  });

  it("sets autoPlay at index 7", () => {
    expect(buildSettingsPayload({ autoPlay: true })[7]).toBe(1);
    expect(buildSettingsPayload({ autoPlay: false })[7]).toBe(2);
  });

  it("sets notification at index 11", () => {
    expect(buildSettingsPayload({ notification: true })[11]).toBe(1);
    expect(buildSettingsPayload({ notification: false })[11]).toBe(2);
  });

  it("sets multiple settings at once", () => {
    const payload = buildSettingsPayload({ autoRecord: true, notification: false });
    expect(payload[3]).toBe(1);
    expect(payload[7]).toBe(0); // unchanged
    expect(payload[11]).toBe(2);
  });
});

// ─── Helper to build a binary file entry ─────────────────────────────────

function buildFileEntry(opts: {
  version?: number;
  name: string;
  length: number;
  signature?: string;
}): number[] {
  const data: number[] = [];
  const ver = opts.version ?? 1;
  const nameBytes = Array.from(opts.name, (c) => c.charCodeAt(0));
  const sig = opts.signature ?? "00".repeat(16);

  data.push(ver);
  data.push((nameBytes.length >> 16) & 0xff);
  data.push((nameBytes.length >> 8) & 0xff);
  data.push(nameBytes.length & 0xff);
  data.push(...nameBytes);

  data.push((opts.length >> 24) & 0xff);
  data.push((opts.length >> 16) & 0xff);
  data.push((opts.length >> 8) & 0xff);
  data.push(opts.length & 0xff);

  data.push(...new Array(6).fill(0)); // timestamp

  for (let i = 0; i < 32; i += 2) {
    data.push(parseInt(sig.substring(i, i + 2), 16));
  }

  return data;
}

describe("parseFileList", () => {
  it("parses a single WAV recording entry", () => {
    const body = buildFileEntry({
      name: "20260303120000REC00.wav",
      length: 1024000,
      signature: "abcdef0123456789abcdef0123456789",
    });
    const files = parseFileList(body);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("20260303120000REC00.wav");
    expect(files[0].length).toBe(1024000);
    expect(files[0].version).toBe(1);
    expect(files[0].signature).toBe("abcdef0123456789abcdef0123456789");
    expect(files[0].time).toBeInstanceOf(Date);
    expect(files[0].time!.getFullYear()).toBe(2026);
    expect(files[0].time!.getMonth()).toBe(2); // March = 2 (0-indexed)
    expect(files[0].time!.getDate()).toBe(3);
  });

  it("parses multiple file entries", () => {
    const entry1 = buildFileEntry({ name: "20260303120000REC00.wav", length: 500 });
    const entry2 = buildFileEntry({ name: "20260303130000REC01.wav", length: 800 });
    const body = [...entry1, ...entry2];
    const files = parseFileList(body);
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("20260303120000REC00.wav");
    expect(files[0].length).toBe(500);
    expect(files[1].name).toBe("20260303130000REC01.wav");
    expect(files[1].length).toBe(800);
  });

  it("handles 0xFFFF count header prefix", () => {
    const entry = buildFileEntry({ name: "20260303120000REC00.wav", length: 100 });
    const header = [0xff, 0xff, 0x00, 0x00, 0x00, 0x01];
    const body = [...header, ...entry];
    const files = parseFileList(body);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("20260303120000REC00.wav");
  });

  it("parses .hda file entries with null time for non-matching names", () => {
    const entry = buildFileEntry({ name: "somefile.txt", length: 256 });
    const files = parseFileList(entry);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("somefile.txt");
    expect(files[0].time).toBeNull();
  });

  it("returns empty array for empty body", () => {
    expect(parseFileList([])).toEqual([]);
  });

  it("returns empty array for body too short for a full entry", () => {
    expect(parseFileList([0x01, 0x00, 0x00])).toEqual([]);
  });

  it("handles custom version number", () => {
    const entry = buildFileEntry({ version: 3, name: "20260303120000REC00.wav", length: 42 });
    const files = parseFileList(entry);
    expect(files[0].version).toBe(3);
  });

  it("stops parsing when remaining bytes are insufficient", () => {
    const entry = buildFileEntry({ name: "20260303120000REC00.wav", length: 100 });
    const truncated = entry.slice(0, entry.length - 5);
    const files = parseFileList(truncated);
    expect(files).toHaveLength(0);
  });
});
