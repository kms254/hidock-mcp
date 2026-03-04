import { describe, it, expect, vi, beforeEach } from "vitest";
import { HiDockDevice } from "../src/device.js";
import { UsbTransport } from "../src/transport.js";
import { CommandId, type WireFrame } from "../src/types.js";
import type { ParsedResponse } from "../src/protocol.js";

function buildFileEntryBytes(opts: { name: string; length: number }): number[] {
  const data: number[] = [];
  const nameBytes = Array.from(opts.name, (c) => c.charCodeAt(0));

  data.push(1); // version
  data.push((nameBytes.length >> 16) & 0xff);
  data.push((nameBytes.length >> 8) & 0xff);
  data.push(nameBytes.length & 0xff);
  data.push(...nameBytes);
  data.push((opts.length >> 24) & 0xff);
  data.push((opts.length >> 16) & 0xff);
  data.push((opts.length >> 8) & 0xff);
  data.push(opts.length & 0xff);
  data.push(...new Array(6).fill(0)); // timestamp
  data.push(...new Array(16).fill(0)); // signature

  return data;
}

function createMockTransport() {
  const handlers: Array<(frame: WireFrame) => boolean> = [];

  const transport = {
    isConnected: true,
    deviceModel: "hidock-h1" as const,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendCommand: vi.fn<[number, number[], number], Promise<ParsedResponse | null>>(),
    sendRaw: vi.fn<[number, number[]], Promise<void>>(),
    onFrame: vi.fn((handler: (frame: WireFrame) => boolean) => {
      handlers.push(handler);
    }),
    removeFrameHandler: vi.fn((handler: (frame: WireFrame) => boolean) => {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }),
    _simulateFrame(frame: WireFrame) {
      for (const h of handlers) {
        if (h(frame)) return true;
      }
      return false;
    },
    _handlers: handlers,
  };

  return transport;
}

function createDeviceWithMock(mockTransport: ReturnType<typeof createMockTransport>) {
  const device = new HiDockDevice();
  // Replace the private transport with our mock
  (device as unknown as { transport: typeof mockTransport }).transport =
    mockTransport as unknown as UsbTransport;
  return device;
}

describe("HiDockDevice.listFiles", () => {
  let mock: ReturnType<typeof createMockTransport>;
  let device: HiDockDevice;

  beforeEach(() => {
    mock = createMockTransport();
    device = createDeviceWithMock(mock);
  });

  it("returns empty array when file count is zero", async () => {
    mock.sendCommand.mockResolvedValueOnce({
      type: "fileCount",
      data: { count: 0 },
    });

    const files = await device.listFiles();
    expect(files).toEqual([]);
    expect(mock.sendRaw).not.toHaveBeenCalled();
  });

  it("returns null when file count request times out", async () => {
    mock.sendCommand.mockResolvedValueOnce(null);

    const files = await device.listFiles();
    expect(files).toBeNull();
  });

  it("lists files from a single response frame", async () => {
    mock.sendCommand.mockResolvedValueOnce({
      type: "fileCount",
      data: { count: 1 },
    });
    mock.sendRaw.mockImplementation(async () => {
      const body = buildFileEntryBytes({ name: "20260303120000REC00.wav", length: 4096 });
      queueMicrotask(() => {
        mock._simulateFrame({
          commandId: CommandId.QueryFileList,
          sequence: 0,
          bodyLength: body.length,
          padding: 0,
          body,
        });
      });
    });

    const files = await device.listFiles();
    expect(files).toHaveLength(1);
    expect(files![0].name).toBe("20260303120000REC00.wav");
    expect(files![0].length).toBe(4096);
    expect(mock.onFrame).toHaveBeenCalledOnce();
    expect(mock.removeFrameHandler).toHaveBeenCalledOnce();
  });

  it("accumulates files across multiple response frames", async () => {
    mock.sendCommand.mockResolvedValueOnce({
      type: "fileCount",
      data: { count: 2 },
    });
    mock.sendRaw.mockImplementation(async () => {
      const body1 = buildFileEntryBytes({ name: "20260303120000REC00.wav", length: 100 });
      const body2 = buildFileEntryBytes({ name: "20260303130000REC01.wav", length: 200 });

      queueMicrotask(() => {
        mock._simulateFrame({
          commandId: CommandId.QueryFileList,
          sequence: 0,
          bodyLength: body1.length,
          padding: 0,
          body: body1,
        });
        mock._simulateFrame({
          commandId: CommandId.QueryFileList,
          sequence: 0,
          bodyLength: body2.length,
          padding: 0,
          body: body2,
        });
      });
    });

    const files = await device.listFiles();
    expect(files).toHaveLength(2);
    expect(files![0].name).toBe("20260303120000REC00.wav");
    expect(files![0].length).toBe(100);
    expect(files![1].name).toBe("20260303130000REC01.wav");
    expect(files![1].length).toBe(200);
  });

  it("ignores frames for other commands", async () => {
    mock.sendCommand.mockResolvedValueOnce({
      type: "fileCount",
      data: { count: 1 },
    });
    mock.sendRaw.mockImplementation(async () => {
      const fileBody = buildFileEntryBytes({ name: "20260303120000REC00.wav", length: 50 });

      queueMicrotask(() => {
        const consumed = mock._simulateFrame({
          commandId: CommandId.QueryDeviceInfo,
          sequence: 0,
          bodyLength: 4,
          padding: 0,
          body: [0, 0, 0, 0],
        });
        expect(consumed).toBe(false);

        mock._simulateFrame({
          commandId: CommandId.QueryFileList,
          sequence: 0,
          bodyLength: fileBody.length,
          padding: 0,
          body: fileBody,
        });
      });
    });

    const files = await device.listFiles();
    expect(files).toHaveLength(1);
  });

  it("throws when device is not connected", async () => {
    mock.isConnected = false;
    await expect(device.listFiles()).rejects.toThrow("Device not connected");
  });
});
