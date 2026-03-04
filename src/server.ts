import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { HiDockDevice } from "./device.js";
import { getTool, getToolDefinitions } from "./tools.js";

function text(obj: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }],
  };
}

/** Exported for testing. */
export async function handleTool(
  device: HiDockDevice,
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tool = getTool(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);

  if (tool.requiresConnection && !device.isConnected) {
    throw new Error("HiDock not connected. Call hidock_connect first.");
  }

  const result = await tool.execute(device, args);
  return text(result);
}

export async function createAndRunServer(device: HiDockDevice): Promise<void> {
  const server = new Server(
    { name: "hidock-mcp", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getToolDefinitions(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return handleTool(
      device,
      request.params.name,
      (request.params.arguments ?? {}) as Record<string, unknown>,
    );
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "hidock://status",
        name: "HiDock Connection Status",
        description: "Current connection state and device model",
        mimeType: "application/json",
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri === "hidock://status") {
      return {
        contents: [
          {
            uri: "hidock://status",
            mimeType: "application/json",
            text: JSON.stringify({
              connected: device.isConnected,
              model: device.deviceModel,
            }),
          },
        ],
      };
    }
    throw new Error(`Unknown resource: ${request.params.uri}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HiDock MCP server running on stdio");
}
