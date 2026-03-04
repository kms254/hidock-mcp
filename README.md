# hidock-mcp

An MCP (Model Context Protocol) server for [HiDock](https://www.hidock.com/) USB audio recorder devices. Communicate with HiDock hardware directly from AI assistants like Claude, Cursor, or any MCP-compatible client.

Supports the HiDock H1, H1E, P1, and P1 Mini over USB.

## What it does

This server exposes HiDock device operations as MCP tools, letting an AI assistant:

- Query device info, firmware versions, and serial number
- Read and set the device clock
- List, count, and delete recording files
- Check storage capacity and card health
- Read and update device settings (auto-record, auto-play, notifications)
- Format the storage card
- Switch the device into USB mass-storage mode
- Send raw commands for debugging

## Tools

| Tool                  | Description                                                                |
| --------------------- | -------------------------------------------------------------------------- |
| `hidock_connect`      | Scan USB for a HiDock device and open a connection                         |
| `hidock_disconnect`   | Close the USB connection                                                   |
| `hidock_device_info`  | Firmware version, version number, serial number                            |
| `hidock_version_info` | Detailed versions: Bluetooth, DSP, UAC, inter-chip gateway, earphone, base |
| `hidock_get_time`     | Read device clock                                                          |
| `hidock_set_time`     | Set device clock (optional ISO 8601 timestamp, defaults to system time)    |
| `hidock_file_count`   | Number of recording files on device                                        |
| `hidock_list_files`   | All files with name, size, timestamp, MD5 signature                        |
| `hidock_delete_file`  | Delete a recording by exact filename                                       |
| `hidock_card_info`    | Storage capacity (MB), used space (MB), card status                        |
| `hidock_format_card`  | Format/erase the storage card (up to 5 min)                                |
| `hidock_get_settings` | Read auto-record, auto-play, notification preferences                      |
| `hidock_set_settings` | Update one or more device settings                                         |
| `hidock_mass_storage` | Switch to USB mass-storage mode (drops USB connection)                     |
| `hidock_raw_command`  | Send an arbitrary command ID + hex payload for debugging                   |

## Resources

| URI               | Description                                       |
| ----------------- | ------------------------------------------------- |
| `hidock://status` | JSON with `connected` (bool) and `model` (string) |

## Prerequisites

- **Node.js** 22+
- **libusb** — required by the [`usb`](https://www.npmjs.com/package/usb) npm package
  - macOS: `brew install libusb`
  - Ubuntu/Debian: `sudo apt install libusb-1.0-0-dev`
  - Windows: [Zadig](https://zadig.akeo.ie/) to install a WinUSB driver for the device
- A HiDock device connected via USB

## Setup

```bash
git clone https://github.com/kms254/hidock-mcp.git
cd hidock-mcp
npm install
npm run build
```

## Usage with Cursor

Add to your Cursor MCP config (`~/.cursor/mcp.json` or workspace `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "hidock": {
      "command": "node",
      "args": ["/path/to/hidock-mcp/dist/index.js"]
    }
  }
}
```

Restart Cursor, then ask your assistant to `hidock_connect` and interact with the device.

## Usage with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hidock": {
      "command": "node",
      "args": ["/path/to/hidock-mcp/dist/index.js"]
    }
  }
}
```

## Project structure

```
src/
├── index.ts      — Entry point: creates device and runs the MCP server
├── server.ts     — MCP server setup, request handlers (tools, resources), stdio transport
├── tools.ts      — Tool registry: definitions and execute handlers for all 15 tools
├── device.ts     — HiDock device API (connect, getDeviceInfo, listFiles, formatCard, etc.)
├── transport.ts  — Low-level USB transport (frame encode/decode, polling, dispatch)
├── protocol.ts   — Binary wire protocol: frame encode/decode, BCD time encoding, response parsers
└── types.ts      — TypeScript interfaces, enums, and constants for the HiDock protocol
```

## Development

```bash
npm install
npm run build      # compile TypeScript to dist/
npm test           # run unit tests
npm run test:coverage   # run tests with coverage report
npm run lint       # ESLint
npm run format     # Prettier
```

## Protocol

The HiDock USB protocol is based on the publicly available [test interface](https://hw.test.hidock.com/). Key details:

- **Transport**: USB bulk transfer (vendor ID `0x10D6`)
- **Frame format**: `0x1234` header, 2-byte command ID, 4-byte sequence number, 4-byte length (with padding in high byte), then body
- **Encoding**: Big-endian integers, BCD-encoded timestamps
- **18 command opcodes** covering device info, time sync, file management, storage, settings, firmware updates, and mass storage mode

### Card status decoding

The `hidock_card_info` tool returns a `status` field as a hex string. This maps to the standard 32-bit SD Card Status Register (CSR):

| Bit | Flag              | Meaning                                    |
| --- | ----------------- | ------------------------------------------ |
| 31  | OUT_OF_RANGE      | Command argument out of range              |
| 30  | ADDRESS_ERROR     | Misaligned address or bad NAND blocks      |
| 29  | BLOCK_LEN_ERROR   | Wrong block length                         |
| 26  | WP_VIOLATION      | Write failed due to write protection       |
| 11  | ERASE_RESET       | Previous erase sequence interrupted        |
| 10  | CARD_ECC_DISABLED | ECC disabled                               |
| 9   | WP_ERASE_SKIP     | Skipped erasing bad/write-protected blocks |
| 8   | READY_FOR_DATA    | Card ready for next data transfer          |

A healthy card typically returns `0x000000` or a value with only bit 8 set.

## Troubleshooting

### Format / optimize fails with error code `0x01`

If `hidock_format_card` returns `{ "result": "failed", "rawCode": 1 }`, check the card status with `hidock_card_info`.

**Status `0x400E00`** — This indicates degraded onboard flash memory. Decoded:

- **ADDRESS_ERROR** (bit 30) — the card controller cannot address certain memory regions, pointing to bad NAND blocks
- **ERASE_RESET** (bit 11) — a previous erase/format was interrupted or never completed
- **CARD_ECC_DISABLED** (bit 10) — error correction is off
- **WP_ERASE_SKIP** (bit 9) — the controller is skipping damaged blocks during erase operations

Other symptoms include used space showing several GB with zero files on the device. The HiDock H1's 32 GB storage is soldered onboard eMMC/NAND and is not user-replaceable. If you see this status, contact [HiDock support](https://www.hidock.com/) for a replacement.

### Device info times out

If `hidock_device_info` returns `{ "error": "timeout" }`, try disconnecting and reconnecting. Sending multiple commands in rapid succession can cause the device to miss a response. Each command uses a sequence number, so a timed-out command won't block subsequent ones.

### No HiDock device found

- Make sure the device is connected via USB (not just Bluetooth)
- On macOS, your terminal may need USB access permission in System Settings > Privacy & Security
- On Linux, you may need a udev rule granting access to vendor ID `0x10D6`
- On Windows, use [Zadig](https://zadig.akeo.ie/) to install the WinUSB driver for the device

## License

MIT
