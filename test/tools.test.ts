import { describe, it, expect } from "vitest";
import { getTool, getToolDefinitions } from "../src/tools.js";

describe("getTool", () => {
  it("returns a tool for known name", () => {
    const tool = getTool("hidock_connect");
    expect(tool).toBeDefined();
    expect(tool!.definition.name).toBe("hidock_connect");
    expect(tool!.requiresConnection).toBe(false);
  });

  it("returns undefined for unknown name", () => {
    expect(getTool("unknown_tool")).toBeUndefined();
    expect(getTool("")).toBeUndefined();
  });

  it("returns tools for all expected names", () => {
    const names = [
      "hidock_connect",
      "hidock_disconnect",
      "hidock_device_info",
      "hidock_list_files",
      "hidock_raw_command",
    ];
    for (const name of names) {
      const tool = getTool(name);
      expect(tool).toBeDefined();
      expect(tool!.definition.name).toBe(name);
    }
  });
});

describe("getToolDefinitions", () => {
  it("returns 15 tool definitions", () => {
    const defs = getToolDefinitions();
    expect(defs).toHaveLength(15);
  });

  it("each definition has name, description, inputSchema", () => {
    const defs = getToolDefinitions();
    for (const d of defs) {
      expect(d).toHaveProperty("name");
      expect(d).toHaveProperty("description");
      expect(d).toHaveProperty("inputSchema");
      expect(typeof d.name).toBe("string");
      expect(typeof d.description).toBe("string");
      expect(d.inputSchema).toEqual(expect.objectContaining({ type: "object" }));
    }
  });

  it("definitions include hidock_connect and hidock_list_files", () => {
    const defs = getToolDefinitions();
    const names = defs.map((d) => d.name);
    expect(names).toContain("hidock_connect");
    expect(names).toContain("hidock_list_files");
  });
});
