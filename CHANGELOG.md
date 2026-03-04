# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
