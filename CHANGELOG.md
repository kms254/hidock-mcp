# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-03-03

### Added

- CI: workflow_dispatch so the workflow can be run manually from the Actions tab
- CI: push to tags `v*` runs full CI and creates a GitHub release with dist artifacts (JS, source maps, declarations)
- Release notes for tagged releases are generated from the matching CHANGELOG section
- Test coverage reporting (`npm run test:coverage`) with v8
- Unit tests for tool registry (`getTool`, `getToolDefinitions`) and server (`handleTool` with mock device)
- README Development section (test, test:coverage, lint, format)

### Changed

- Project structure: MCP server setup moved to `server.ts`; tool definitions and registry in `tools.ts`; `index.ts` is entry-only
- Tool registry is a single array; lookup via `getTool()` / `getToolDefinitions()` (no Map, no separate name list)
- README project structure updated to list all source files (transport, protocol, types, server, tools, device, index)
- `.gitignore` includes `coverage/`

## [1.0.0] - 2026-03-03

### Added

- MCP server with 15 tools for HiDock device management over USB
- Device connection and discovery (H1, H1E, P1, P1 Mini) via vendor ID `0x10D6`
- Device info and firmware version queries (Bluetooth, DSP, UAC, inter-chip gateway, earphone, base)
- Clock read/write with BCD-encoded timestamps
- File management: count, list, delete
- Storage diagnostics: card info with CSR status decoding, format/optimize
- Device settings: auto-record, auto-play, notification preferences
- Mass storage mode switching
- Raw command tool for protocol debugging
- Binary wire protocol implementation based on the public HiDock test interface
- Unit tests for all protocol encoding, decoding, and parsing functions
- GitHub Actions CI workflow for build and test on PR and merge
