# youtrack-http-api-mcp

MCP (Model Context Protocol) server for **YouTrack** over the official HTTP API.  
Initial focus: Knowledge Base (Articles), with a roadmap to cover the same surface as the official YouTrack MCP (issues, search, projects, etc.) where the REST API provides an adequate alternative.

Works with any YouTrack instance that exposes the standard [YouTrack REST API](https://www.jetbrains.com/help/youtrack/server/youtrack-rest-api.html).

## Requirements

- Node.js 18+
- YouTrack base URL and a [permanent token](https://www.jetbrains.com/help/youtrack/server/manage-personal-access-tokens.html) with permissions for the entities you want to access (articles, issues, etc.)

## Install

### From source (Git repo)

```bash
git clone https://github.com/rkorablin/youtrack-http-api-mcp.git
cd youtrack-http-api-mcp
npm install
```

### From npm

As a local dependency:

```bash
npm install youtrack-http-api-mcp
```

Or globally (for `npx` / CLI usage):

```bash
npm install -g youtrack-http-api-mcp
```

## Configuration

Set environment variables:

| Variable         | Required | Description                                                 |
|------------------|----------|-------------------------------------------------------------|
| `YOUTRACK_URL`   | Yes      | YouTrack base URL (e.g. `https://youtrack.example.com`)    |
| `YOUTRACK_TOKEN` | Yes      | Permanent token (Bearer)                                   |

No default URLs or tokens; safe to publish and use in any environment.

## Usage

### Standalone (stdio)

```bash
export YOUTRACK_URL="https://youtrack.example.com"
export YOUTRACK_TOKEN="perm-..."
node server.mjs
```

### Cursor / MCP host

Add to your MCP config (e.g. `.cursor/mcp.json` under `mcpServers`).

#### Option 1: Local clone

```json
"youtrack": {
  "command": "node",
  "args": ["/absolute/path/to/youtrack-http-api-mcp/server.mjs"],
  "env": {
    "YOUTRACK_URL": "https://youtrack.example.com",
    "YOUTRACK_TOKEN": "YOUR_TOKEN"
  }
}
```

#### Option 2: npm / npx

If installed globally:

```json
"youtrack": {
  "command": "youtrack-http-api-mcp",
  "env": {
    "YOUTRACK_URL": "https://youtrack.example.com",
    "YOUTRACK_TOKEN": "YOUR_TOKEN"
  }
}
```

Or via `npx`:

```json
"youtrack": {
  "command": "npx",
  "args": ["-y", "youtrack-http-api-mcp"],
  "env": {
    "YOUTRACK_URL": "https://youtrack.example.com",
    "YOUTRACK_TOKEN": "YOUR_TOKEN"
  }
}
```

## Current tools (MVP)

Initial version implements the **Knowledge Base (Articles)** surface, cloned from `youtrack-kb-mcp`:

| Tool                         | Description                                    |
|------------------------------|-----------------------------------------------|
| `youtrack_kb_list_articles`  | List articles (optional project, pagination)  |
| `youtrack_kb_get_article`    | Get one article by id                         |
| `youtrack_kb_create_article` | Create article (summary, content, project)    |
| `youtrack_kb_update_article` | Update article summary and/or content         |

## Roadmap towards official MCP parity

High-level plan (details in ONBOARDING and project notes):

- **Research official YouTrack MCP**: list tools, their arguments and expected outputs.
- **Map each tool to YouTrack HTTP API**: identify REST endpoints or combinations for issues, search, projects, users, KB, etc.
- **Implement HTTP-based tools**: add MCP tools with structured input schemas and consistent JSON outputs.
- **Align UX and naming**: keep tool names, descriptions and semantics as close as reasonable to the official MCP, within HTTP API constraints.
- **Harden and document**: better error handling, timeouts, pagination, and examples for typical AI-assistant workflows.

## License

MIT

