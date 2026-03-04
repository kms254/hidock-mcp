import { CommandId, type SetSettingsPayload, type WireFrame } from "./types.js";
import {
  parseFileList,
  formatDateForDevice,
  buildSettingsPayload,
  type ParsedResponse,
} from "./protocol.js";
import type { FileInfo } from "./types.js";
import { UsbTransport } from "./transport.js";

export class HiDockDevice {
  private transport = new UsbTransport();
  private fileListAccumulator: FileListAccumulator | null = null;

  get isConnected(): boolean {
    return this.transport.isConnected;
  }

  get deviceModel() {
    return this.transport.deviceModel;
  }

  async connect(): Promise<void> {
    await this.transport.connect();
  }

  disconnect(): void {
    this.transport.disconnect();
  }

  // ─── Device Info ──────────────────────────────────────────────────────────

  getDeviceInfo(timeoutSec = 10): Promise<ParsedResponse | null> {
    return this.transport.sendCommand(CommandId.QueryDeviceInfo, [], timeoutSec);
  }

  getVersionInfo(timeoutSec = 10): Promise<ParsedResponse | null> {
    return this.transport.sendCommand(CommandId.TestFirmwareVersion, [], timeoutSec);
  }

  // ─── Clock ────────────────────────────────────────────────────────────────

  getTime(timeoutSec = 5): Promise<ParsedResponse | null> {
    return this.transport.sendCommand(CommandId.QueryDeviceTime, [], timeoutSec);
  }

  setTime(date: Date, timeoutSec = 5): Promise<ParsedResponse | null> {
    return this.transport.sendCommand(
      CommandId.SetDeviceTime,
      formatDateForDevice(date),
      timeoutSec,
    );
  }

  // ─── Files ────────────────────────────────────────────────────────────────

  getFileCount(timeoutSec = 5): Promise<ParsedResponse | null> {
    return this.transport.sendCommand(CommandId.QueryFileCount, [], timeoutSec);
  }

  /**
   * List all files on the device.
   * Multi-step protocol: queries file count, then sends QUERY_FILE_LIST
   * and accumulates multiple response frames until all entries are received.
   */
  async listFiles(timeoutSec = 30): Promise<FileInfo[] | null> {
    if (!this.transport.isConnected) throw new Error("Device not connected");
    if (this.fileListAccumulator) throw new Error("File list request already in progress");

    const countResp = await this.getFileCount(5);
    if (!countResp || countResp.type !== "fileCount") return null;
    const expectedCount = (countResp.data as { count: number }).count;
    if (expectedCount === 0) return [];

    return new Promise<FileInfo[] | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.transport.removeFrameHandler(handler);
        this.fileListAccumulator = null;
        resolve(null);
      }, timeoutSec * 1000);

      this.fileListAccumulator = {
        expectedCount,
        bodyChunks: [],
        resolve: (files) => {
          clearTimeout(timeout);
          this.transport.removeFrameHandler(handler);
          this.fileListAccumulator = null;
          resolve(files);
        },
        reject: (err) => {
          clearTimeout(timeout);
          this.transport.removeFrameHandler(handler);
          this.fileListAccumulator = null;
          reject(err);
        },
        timeout,
      };

      const handler = (frame: WireFrame): boolean => {
        if (frame.commandId !== CommandId.QueryFileList || !this.fileListAccumulator) return false;
        this.fileListAccumulator.bodyChunks.push(frame.body);
        this.tryResolveFileList();
        return true;
      };

      this.transport.onFrame(handler);
      this.transport.sendRaw(CommandId.QueryFileList).catch((err) => {
        clearTimeout(timeout);
        this.transport.removeFrameHandler(handler);
        this.fileListAccumulator = null;
        reject(err);
      });
    });
  }

  deleteFile(filename: string, timeoutSec = 10): Promise<ParsedResponse | null> {
    const body = Array.from(filename, (c) => c.charCodeAt(0));
    return this.transport.sendCommand(CommandId.DeleteFile, body, timeoutSec);
  }

  // ─── Storage ──────────────────────────────────────────────────────────────

  getCardInfo(timeoutSec = 5): Promise<ParsedResponse | null> {
    return this.transport.sendCommand(CommandId.ReadCardInfo, [], timeoutSec);
  }

  formatCard(timeoutSec = 300): Promise<ParsedResponse | null> {
    return this.transport.sendCommand(CommandId.FormatCard, [1, 2, 3, 4], timeoutSec);
  }

  enterMassStorage(timeoutSec = 5): Promise<ParsedResponse | null> {
    return this.transport.sendCommand(CommandId.MassStorage, [0x01], timeoutSec);
  }

  // ─── Settings ─────────────────────────────────────────────────────────────

  getSettings(timeoutSec = 5): Promise<ParsedResponse | null> {
    return this.transport.sendCommand(CommandId.GetSettings, [], timeoutSec);
  }

  setSettings(opts: SetSettingsPayload, timeoutSec = 5): Promise<ParsedResponse | null> {
    return this.transport.sendCommand(
      CommandId.SetSettings,
      buildSettingsPayload(opts),
      timeoutSec,
    );
  }

  // ─── Debug ────────────────────────────────────────────────────────────────

  rawCommand(commandId: number, body: number[], timeoutSec = 10): Promise<ParsedResponse | null> {
    return this.transport.sendCommand(commandId, body, timeoutSec);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private tryResolveFileList(): void {
    if (!this.fileListAccumulator) return;
    const { expectedCount, bodyChunks } = this.fileListAccumulator;

    const combined: number[] = [];
    for (const chunk of bodyChunks) {
      for (const b of chunk) combined.push(b);
    }

    const files = parseFileList(combined);
    if (files.length >= expectedCount) {
      this.fileListAccumulator.resolve(files);
    }
  }
}

interface FileListAccumulator {
  expectedCount: number;
  bodyChunks: number[][];
  resolve: (files: FileInfo[]) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}
