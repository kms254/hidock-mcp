import { describe, it, expect, vi } from "vitest";
import { handleTool } from "../src/server.js";
import type { HiDockDevice } from "../src/device.js";

function createMockDevice(overrides: Partial<HiDockDevice> = {}): HiDockDevice {
  return {
    isConnected: false,
    deviceModel: "hidock-h1",
    connect: vi.fn(),
    disconnect: vi.fn(),
    getDeviceInfo: vi.fn(),
    getVersionInfo: vi.fn(),
    getTime: vi.fn(),
    setTime: vi.fn(),
    getFileCount: vi.fn(),
    listFiles: vi.fn(),
    deleteFile: vi.fn(),
    getCardInfo: vi.fn(),
    formatCard: vi.fn(),
    getSettings: vi.fn(),
    setSettings: vi.fn(),
    enterMassStorage: vi.fn(),
    rawCommand: vi.fn(),
    ...overrides,
  } as unknown as HiDockDevice;
}

describe("handleTool", () => {
  it("hidock_connect connects and returns connected + model", async () => {
    const device = createMockDevice();
    const result = await handleTool(device, "hidock_connect", {});
    expect(device.connect).toHaveBeenCalledOnce();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const body = JSON.parse(result.content[0].text);
    expect(body).toEqual({ connected: true, model: "hidock-h1" });
  });

  it("hidock_disconnect disconnects and returns disconnected", async () => {
    const device = createMockDevice();
    const result = await handleTool(device, "hidock_disconnect", {});
    expect(device.disconnect).toHaveBeenCalledOnce();
    const body = JSON.parse(result.content[0].text);
    expect(body).toEqual({ disconnected: true });
  });

  it("throws for unknown tool name", async () => {
    const device = createMockDevice();
    await expect(handleTool(device, "unknown_tool", {})).rejects.toThrow(
      "Unknown tool: unknown_tool",
    );
  });

  it("throws when tool requires connection but device not connected", async () => {
    const device = createMockDevice({ isConnected: false });
    await expect(handleTool(device, "hidock_device_info", {})).rejects.toThrow(
      "HiDock not connected",
    );
    expect(device.getDeviceInfo).not.toHaveBeenCalled();
  });

  it("calls device.getDeviceInfo for hidock_device_info when connected", async () => {
    const device = createMockDevice({
      isConnected: true,
      getDeviceInfo: vi.fn().mockResolvedValue({ type: "deviceInfo", data: { serial: "123" } }),
    });
    const result = await handleTool(device, "hidock_device_info", {});
    expect(device.getDeviceInfo).toHaveBeenCalledOnce();
    const body = JSON.parse(result.content[0].text);
    expect(body).toEqual({ serial: "123" });
  });

  it("returns timeout error when getDeviceInfo returns null", async () => {
    const device = createMockDevice({
      isConnected: true,
      getDeviceInfo: vi.fn().mockResolvedValue(null),
    });
    const result = await handleTool(device, "hidock_device_info", {});
    const body = JSON.parse(result.content[0].text);
    expect(body).toEqual({ error: "timeout" });
  });

  it("hidock_set_time uses args.timestamp when provided", async () => {
    const device = createMockDevice({
      isConnected: true,
      setTime: vi.fn().mockResolvedValue({ type: "time", data: {} }),
    });
    await handleTool(device, "hidock_set_time", {
      timestamp: "2026-03-03T12:00:00",
    });
    expect(device.setTime).toHaveBeenCalledWith(expect.any(Date));
    const call = (device.setTime as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.toISOString()).toContain("2026-03-03");
  });

  it("hidock_delete_file requires filename and calls device.deleteFile", async () => {
    const device = createMockDevice({
      isConnected: true,
      deleteFile: vi.fn().mockResolvedValue({ type: "deleteFile", data: { ok: true } }),
    });
    const result = await handleTool(device, "hidock_delete_file", {
      filename: "20260303120000REC00.wav",
    });
    expect(device.deleteFile).toHaveBeenCalledWith("20260303120000REC00.wav");
    const body = JSON.parse(result.content[0].text);
    expect(body).toEqual({ ok: true });
  });

  it("hidock_delete_file throws when filename missing", async () => {
    const device = createMockDevice({ isConnected: true });
    await expect(handleTool(device, "hidock_delete_file", {})).rejects.toThrow(
      "filename is required",
    );
  });
});
