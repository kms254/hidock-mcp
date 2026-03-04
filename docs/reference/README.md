# Reference Material

## hw-test-hidock.html

Source: [https://hw.test.hidock.com/](https://hw.test.hidock.com/)
Captured: 2026-03-03

This is the complete HTML source of HiDock's public hardware test interface. It contains ~1000 lines of inline JavaScript that implement the USB communication protocol used by HiDock devices (H1, H1E, P1, P1 Mini).

The TypeScript protocol implementation in `src/protocol.ts` and `src/types.ts` is based on this source material. Key things documented in it:

- WebUSB connection with vendor ID `0x10D6` and product ID model mapping
- Binary frame format: `0x1234` header, command ID, sequence number, length, body
- All 18 command opcodes and their request/response payloads
- BCD-encoded timestamps, big-endian integers
- Multi-message file list accumulation protocol
- Response parsers for device info, version info, time, card info, settings, etc.

This file is included as a reference artifact and is not used at runtime.
