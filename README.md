# pasteboard-mcp

MCP server for reading and writing macOS pasteboards. Supports text, images, and custom/arbitrary pasteboard types.

Built with TypeScript + a Swift helper (`pbhelper`) that wraps NSPasteboard.

## Requirements

- macOS
- Node.js >= 18
- Swift compiler (ships with Xcode / Xcode Command Line Tools)

## Install

```bash
git clone https://github.com/benlenarts/pasteboard-mcp.git
cd pasteboard-mcp
npm install
```

### Claude Code

```bash
npm run cc-install
```

### Claude Desktop

```bash
npm run pack
# Open pasteboard.mcpb in Claude Desktop
```

### Manual

Add to your MCP client config:

```json
{
  "mcpServers": {
    "pasteboard": {
      "command": "node",
      "args": ["/path/to/pasteboard-mcp/dist/index.js"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `pasteboard_list_types` | List all UTI type identifiers on the pasteboard |
| `pasteboard_read_text` | Read plain text |
| `pasteboard_write_text` | Write plain text |
| `pasteboard_read_image` | Read image (returns viewable image via MCP) |
| `pasteboard_write_image` | Write base64-encoded image |
| `pasteboard_read` | Read arbitrary type by UTI (e.g. `PrivateThingsPasteboardType`) |
| `pasteboard_write` | Write arbitrary type by UTI |
| `pasteboard_clear` | Clear the pasteboard |

All tools accept an optional `pasteboard` parameter (default: `general`). Other pasteboards: `find`, `font`, `ruler`, `drag`, or any custom name.

## Development

```bash
npm run build          # Compile Swift helper + TypeScript
npm run build:swift    # Compile Swift helper only
npm run build:ts       # Compile TypeScript only
```

## License

MIT
