import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { HiDockDevice } from "./device.js";

export interface HiDockTool {
  definition: Tool;
  requiresConnection: boolean;
  execute(device: HiDockDevice, args: Record<string, unknown>): Promise<unknown>;
}

const emptySchema = { type: "object" as const, properties: {}, required: [] as string[] };

function tool(
  definition: Tool,
  requiresConnection: boolean,
  execute: HiDockTool["execute"],
): HiDockTool {
  return { definition, requiresConnection, execute };
}

export const connectTool: HiDockTool = tool(
  {
    name: "hidock_connect",
    description:
      "Scan the USB bus for a connected HiDock device (H1, H1E, P1, P1 Mini) and open a connection. Must be called before any other hidock_* tool.",
    inputSchema: emptySchema,
  },
  false,
  async (device) => {
    await device.connect();
    return { connected: true, model: device.deviceModel };
  },
);

export const disconnectTool: HiDockTool = tool(
  {
    name: "hidock_disconnect",
    description: "Close the USB connection to the HiDock device.",
    inputSchema: emptySchema,
  },
  false,
  async (device) => {
    device.disconnect();
    return { disconnected: true };
  },
);

export const deviceInfoTool: HiDockTool = tool(
  {
    name: "hidock_device_info",
    description:
      "Get device information including firmware version code, version number, and serial number.",
    inputSchema: emptySchema,
  },
  true,
  async (device) => {
    const resp = await device.getDeviceInfo();
    if (!resp) return { error: "timeout" };
    return resp.data;
  },
);

export const versionInfoTool: HiDockTool = tool(
  {
    name: "hidock_version_info",
    description:
      "Get detailed firmware version info: Bluetooth, DSP, UAC, inter-chip gateway, earphone, and base versions.",
    inputSchema: emptySchema,
  },
  true,
  async (device) => {
    const resp = await device.getVersionInfo();
    if (!resp) return { error: "timeout" };
    return resp.data;
  },
);

export const getTimeTool: HiDockTool = tool(
  {
    name: "hidock_get_time",
    description: "Read the current date/time set on the HiDock device.",
    inputSchema: emptySchema,
  },
  true,
  async (device) => {
    const resp = await device.getTime();
    if (!resp) return { error: "timeout" };
    return resp.data;
  },
);

export const setTimeTool: HiDockTool = tool(
  {
    name: "hidock_set_time",
    description:
      "Set the HiDock device clock. If no ISO timestamp is provided, uses the current system time.",
    inputSchema: {
      type: "object",
      properties: {
        timestamp: {
          type: "string",
          description: "ISO 8601 timestamp (e.g. '2026-03-03T12:00:00'). Defaults to now.",
        },
      },
      required: [],
    },
  },
  true,
  async (device, args) => {
    const date = args.timestamp ? new Date(args.timestamp as string) : new Date();
    const resp = await device.setTime(date);
    if (!resp) return { error: "timeout" };
    return resp.data;
  },
);

export const fileCountTool: HiDockTool = tool(
  {
    name: "hidock_file_count",
    description: "Get the number of recording files stored on the device.",
    inputSchema: emptySchema,
  },
  true,
  async (device) => {
    const resp = await device.getFileCount();
    if (!resp) return { error: "timeout" };
    return resp.data;
  },
);

export const listFilesTool: HiDockTool = tool(
  {
    name: "hidock_list_files",
    description:
      "List all recording files on the device. Returns name, size, recording timestamp, and MD5 signature for each file.",
    inputSchema: emptySchema,
  },
  true,
  async (device) => {
    const files = await device.listFiles();
    if (!files) return { error: "timeout" };
    return files;
  },
);

export const deleteFileTool: HiDockTool = tool(
  {
    name: "hidock_delete_file",
    description: "Delete a recording file from the device by filename.",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Exact filename to delete (e.g. '20260303120000REC00.wav')",
        },
      },
      required: ["filename"],
    },
  },
  true,
  async (device, args) => {
    const filename = args.filename as string;
    if (!filename) throw new Error("filename is required");
    const resp = await device.deleteFile(filename);
    if (!resp) return { error: "timeout" };
    return resp.data;
  },
);

export const cardInfoTool: HiDockTool = tool(
  {
    name: "hidock_card_info",
    description:
      "Get SD card / storage information: total capacity (MB), used space (MB), and card status.",
    inputSchema: emptySchema,
  },
  true,
  async (device) => {
    const resp = await device.getCardInfo();
    if (!resp) return { error: "timeout" };
    return resp.data;
  },
);

export const formatCardTool: HiDockTool = tool(
  {
    name: "hidock_format_card",
    description:
      "Format (optimize) the device storage card. WARNING: This erases all recordings. Takes up to 5 minutes.",
    inputSchema: emptySchema,
  },
  true,
  async (device) => {
    const resp = await device.formatCard();
    if (!resp) return { error: "timeout" };
    return resp.data;
  },
);

export const getSettingsTool: HiDockTool = tool(
  {
    name: "hidock_get_settings",
    description: "Read device settings: auto-record, auto-play, and notification preferences.",
    inputSchema: emptySchema,
  },
  true,
  async (device) => {
    const resp = await device.getSettings();
    if (!resp) return { error: "timeout" };
    return resp.data;
  },
);

export const setSettingsTool: HiDockTool = tool(
  {
    name: "hidock_set_settings",
    description: "Update one or more device settings.",
    inputSchema: {
      type: "object",
      properties: {
        autoRecord: { type: "boolean", description: "Enable/disable automatic recording" },
        autoPlay: { type: "boolean", description: "Enable/disable automatic playback" },
        notification: { type: "boolean", description: "Enable/disable notification sounds" },
      },
      required: [],
    },
  },
  true,
  async (device, args) => {
    const resp = await device.setSettings({
      autoRecord: args.autoRecord as boolean | undefined,
      autoPlay: args.autoPlay as boolean | undefined,
      notification: args.notification as boolean | undefined,
    });
    if (!resp) return { error: "timeout" };
    return resp.data;
  },
);

export const massStorageTool: HiDockTool = tool(
  {
    name: "hidock_mass_storage",
    description:
      "Switch the device into USB mass-storage mode so it appears as a removable drive. The USB connection will be lost after this.",
    inputSchema: emptySchema,
  },
  true,
  async (device) => {
    const resp = await device.enterMassStorage();
    if (!resp) return { error: "timeout" };
    return resp.data;
  },
);

export const rawCommandTool: HiDockTool = tool(
  {
    name: "hidock_raw_command",
    description:
      "Send a raw command to the device for debugging. Provide the command ID as a hex number and an optional body as space-separated hex bytes.",
    inputSchema: {
      type: "object",
      properties: {
        commandId: {
          type: "string",
          description: "Command ID in hex (e.g. '0x11' for FORMAT_CARD, '0x10' for READ_CARD_INFO)",
        },
        body: {
          type: "string",
          description: "Body bytes as space-separated hex (e.g. '01 02 03 04'). Defaults to empty.",
        },
        timeoutSec: {
          type: "number",
          description: "Timeout in seconds. Defaults to 30.",
        },
      },
      required: ["commandId"],
    },
  },
  true,
  async (device, args) => {
    const cmdId = parseInt(args.commandId as string, 16);
    if (isNaN(cmdId)) throw new Error("Invalid commandId hex string");
    const bodyStr = (args.body as string) ?? "";
    const body = bodyStr.trim()
      ? bodyStr
          .trim()
          .split(/\s+/)
          .map((b) => parseInt(b, 16))
      : [];
    const timeout = (args.timeoutSec as number) ?? 30;
    const resp = await device.rawCommand(cmdId, body, timeout);
    if (!resp) return { error: "timeout", commandId: `0x${cmdId.toString(16)}` };
    return resp;
  },
);

/** Single source of truth: add new tools here only. */
const tools: HiDockTool[] = [
  connectTool,
  disconnectTool,
  deviceInfoTool,
  versionInfoTool,
  getTimeTool,
  setTimeTool,
  fileCountTool,
  listFilesTool,
  deleteFileTool,
  cardInfoTool,
  formatCardTool,
  getSettingsTool,
  setSettingsTool,
  massStorageTool,
  rawCommandTool,
];

const toolByName = Object.fromEntries(
  tools.map((t) => [t.definition.name, t]),
) as Record<string, HiDockTool>;

export function getTool(name: string): HiDockTool | undefined {
  return toolByName[name];
}

export function getToolDefinitions(): Tool[] {
  return tools.map((t) => t.definition);
}
