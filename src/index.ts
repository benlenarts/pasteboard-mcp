import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as pb from "./pasteboard.js";

const server = new McpServer({
  name: "pasteboard-mcp",
  version: "1.0.0",
});

// --- Tools ---

server.registerTool("pasteboard_list_types", {
  title: "List Pasteboard Types",
  description:
    "List all available data type identifiers (UTIs) on the pasteboard. Useful for discovering what data formats are present before reading.",
  inputSchema: {
    pasteboard: z
      .string()
      .optional()
      .describe('Pasteboard name (default: "general"). Others: find, font, ruler, drag, or custom names.'),
  },
  annotations: { readOnlyHint: true },
}, async ({ pasteboard }) => {
  const types = await pb.listTypes(pasteboard);
  return { content: [{ type: "text", text: JSON.stringify(types, null, 2) }] };
});

server.registerTool("pasteboard_read_text", {
  title: "Read Pasteboard Text",
  description: "Read plain text content from the pasteboard.",
  inputSchema: {
    pasteboard: z.string().optional().describe("Pasteboard name (default: general)"),
  },
  annotations: { readOnlyHint: true },
}, async ({ pasteboard }) => {
  const text = await pb.readText(pasteboard);
  return { content: [{ type: "text", text }] };
});

server.registerTool("pasteboard_write_text", {
  title: "Write Pasteboard Text",
  description: "Write plain text to the pasteboard. Replaces existing pasteboard contents.",
  inputSchema: {
    text: z.string().describe("Text content to write"),
    pasteboard: z.string().optional().describe("Pasteboard name (default: general)"),
  },
  annotations: { destructiveHint: true },
}, async ({ text, pasteboard }) => {
  await pb.writeText(text, pasteboard);
  return { content: [{ type: "text", text: "Text written to pasteboard." }] };
});

server.registerTool("pasteboard_read_image", {
  title: "Read Pasteboard Image",
  description: "Read image from the pasteboard and return it as a viewable image.",
  inputSchema: {
    pasteboard: z.string().optional().describe("Pasteboard name (default: general)"),
    format: z.enum(["png", "tiff"]).optional().describe("Image format (default: png)"),
  },
  annotations: { readOnlyHint: true },
}, async ({ pasteboard, format }) => {
  const fmt = format ?? "png";
  const base64 = await pb.readImage(pasteboard, fmt);
  const mimeType = fmt === "tiff" ? "image/tiff" : "image/png";
  return { content: [{ type: "image", data: base64, mimeType }] };
});

server.registerTool("pasteboard_write_image", {
  title: "Write Pasteboard Image",
  description:
    "Write a base64-encoded image to the pasteboard. Replaces existing pasteboard contents.",
  inputSchema: {
    data: z.string().describe("Base64-encoded image data"),
    format: z.enum(["png", "tiff"]).optional().describe("Image format of the data (default: png)"),
    pasteboard: z.string().optional().describe("Pasteboard name (default: general)"),
  },
  annotations: { destructiveHint: true },
}, async ({ data, format, pasteboard }) => {
  await pb.writeImage(data, pasteboard, format ?? "png");
  return { content: [{ type: "text", text: "Image written to pasteboard." }] };
});

server.registerTool("pasteboard_read", {
  title: "Read Pasteboard Data",
  description:
    "Read raw data of a specific type from the pasteboard. Returns text for text types, base64 for binary types. Use pasteboard_list_types first to see available types.",
  inputSchema: {
    type: z
      .string()
      .describe("UTI type identifier (e.g. public.utf8-plain-text, public.png, or custom types like PrivateThingsPasteboardType)"),
    pasteboard: z.string().optional().describe("Pasteboard name (default: general)"),
  },
  annotations: { readOnlyHint: true },
}, async ({ type, pasteboard }) => {
  const data = await pb.readData(type, pasteboard);
  return { content: [{ type: "text", text: data }] };
});

server.registerTool("pasteboard_write", {
  title: "Write Pasteboard Data",
  description:
    "Write raw data of a specific type to the pasteboard. Replaces existing pasteboard contents.",
  inputSchema: {
    type: z.string().describe("UTI type identifier"),
    data: z.string().describe("Data to write — text string or base64-encoded binary"),
    is_base64: z
      .boolean()
      .optional()
      .describe("Set to true if data is base64-encoded binary (default: false, treats data as text)"),
    pasteboard: z.string().optional().describe("Pasteboard name (default: general)"),
  },
  annotations: { destructiveHint: true },
}, async ({ type, data, is_base64, pasteboard }) => {
  await pb.writeData(type, data, is_base64 ?? false, pasteboard);
  return { content: [{ type: "text", text: `Data written to pasteboard as ${type}.` }] };
});

server.registerTool("pasteboard_clear", {
  title: "Clear Pasteboard",
  description: "Clear all contents from the pasteboard.",
  inputSchema: {
    pasteboard: z.string().optional().describe("Pasteboard name (default: general)"),
  },
  annotations: { destructiveHint: true },
}, async ({ pasteboard }) => {
  await pb.clear(pasteboard);
  return { content: [{ type: "text", text: "Pasteboard cleared." }] };
});

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Pasteboard MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
