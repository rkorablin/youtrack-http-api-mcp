# youtrack-http-api-mcp

MCP (Model Context Protocol) server for **YouTrack** over the official HTTP API.  
Initial focus: Knowledge Base (Articles), with a roadmap to cover the same surface as the official YouTrack MCP (issues, search, projects, etc.) where the REST API provides an adequate alternative.

Works with any YouTrack instance that exposes the standard [YouTrack REST API](https://www.jetbrains.com/help/youtrack/server/youtrack-rest-api.html).

**Tested against:** YouTrack **Cloud** and **Server** REST API as documented in the [Developer Portal](https://www.jetbrains.com/help/youtrack/devportal/resource-api-commands.html) (commands require `issues[]` since documented revisions; `muteUpdateNotifications` exists from **2021.3**). If your build behaves differently, capture the stderr log on HTTP **400** (see below).

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

## Commands API (`POST /api/commands`)

Tools that change issues through **Apply Command** (`youtrack_link_issues`, `youtrack_manage_issue_tags`, `youtrack_change_issue_assignee`) send a [CommandList](https://www.jetbrains.com/help/youtrack/devportal/resource-api-commands.html) JSON body:

- **`query`** — command text (without a leading `for: <issue>`; the target issues are listed separately).
- **`issues`** — non-empty array of issue stubs: `{ "idReadable": "IAG-1" }` and/or `{ "id": "2-15" }`.

Example equivalent to applying “tag `gar-monorepo`” to `IAG-42`:

```json
{
  "query": "tag gar-monorepo",
  "issues": [{ "idReadable": "IAG-42" }]
}
```

### Link types (`youtrack_link_issues`)

The command is applied to **`sourceId`**. Use a **`linkType`** string that matches **your** YouTrack (localized or custom names). Prefer full phrases:

| Intent | Typical `linkType` | Resulting `query` (example target `IAG-1`) |
|--------|--------------------|---------------------------------------------|
| Child of epic / parent | `Subtask of` | `Subtask of IAG-1` |
| Dependency | `depends on` | `depends on IAG-1` |
| Generic link | `relates to` | `relates to IAG-1` |

If `linkType` is a **single word** (no spaces), the server sends `link <linkType> <targetId>` (YouTrack “link” command style).

To see which link types exist in the UI, use YouTrack administration or inspect existing issue links in the web UI. There is no single REST enum used by all instances; names must match the command language of your server.

### Values with spaces (braces syntax)

YouTrack Commands API requires multi-word values to be wrapped in `{braces}`:

```
State {Can be test}
Assignee {John Doe}
tag {my multi-word tag}
priority {Show-stopper}
```

The MCP server **automatically wraps** values for the following tools:
- `youtrack_update_issue_state` — the `state` parameter is wrapped automatically.
- `youtrack_change_issue_assignee` — the `assignee` parameter is wrapped automatically.
- `youtrack_manage_issue_tags` — each tag name in `add` / `remove` is wrapped automatically.

For `youtrack_execute_command` (raw command), **you must wrap values yourself** using `{}` in the `command` string (e.g. `State {In Progress}`).

**Search queries** (`youtrack_search_issues`) also use `{}` for multi-word field values:

```
State: {Can be test}
Assignee: {John Doe}
```

Note: double quotes (`"..."`) are **not** equivalent to braces in YouTrack query/command syntax and may cause HTTP 400. Always prefer `{}`.

### Creating issues: `projectId`

`youtrack_create_issue` accepts:

- **Project shortName** (e.g. `IAG`) → JSON `project: { "shortName": "IAG" }`.
- **Internal project id** (e.g. `81-219`, pattern `digits-digits`) → `project: { "id": "81-219" }`.

Do not send the shortName as `project.id` (YouTrack returns *Invalid structure of entity id*).

### Debugging HTTP 400

On **400 Bad Request**, the server logs to **stderr** (safe for MCP stdio hosts): request path/method, headers **without** `Authorization`, full **request body**, and full **response body**. Check the MCP host logs if a tool call fails.

### Idempotency

Repeating the same link or tag command may return a normal success or a command error from YouTrack (e.g. link already exists). That is acceptable; treat non-400 HTTP failures as hard errors.

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

## Example MCP tool calls (for agents)

Illustrative arguments only; adjust ids to your instance.

**Create issue in project by shortName**

```json
{
  "tool": "youtrack_create_issue",
  "arguments": {
    "projectId": "IAG",
    "summary": "Implement feature X",
    "description": "Details…"
  }
}
```

**Change issue state** (multi-word value — wrapped automatically)

```json
{
  "tool": "youtrack_update_issue_state",
  "arguments": {
    "id": "DV-10",
    "state": "Can be test"
  }
}
```

**Execute arbitrary command**

```json
{
  "tool": "youtrack_execute_command",
  "arguments": {
    "id": "IAG-42",
    "command": "State {In Progress} priority Critical"
  }
}
```

**Add tag**

```json
{
  "tool": "youtrack_manage_issue_tags",
  "arguments": {
    "id": "IAG-42",
    "add": ["gar-monorepo", "ci"]
  }
}
```

**Subtask link** (child `IAG-10` under parent `IAG-1`)

```json
{
  "tool": "youtrack_link_issues",
  "arguments": {
    "sourceId": "IAG-10",
    "targetId": "IAG-1",
    "linkType": "Subtask of"
  }
}
```

**Dependency** (`IAG-5` depends on `IAG-3`)

```json
{
  "tool": "youtrack_link_issues",
  "arguments": {
    "sourceId": "IAG-5",
    "targetId": "IAG-3",
    "linkType": "depends on"
  }
}
```

## Current tools (MVP)

**Knowledge Base** (from `youtrack-kb-mcp`):

| Tool                         | Description                                    |
|------------------------------|-----------------------------------------------|
| `youtrack_kb_list_articles`  | List articles (optional project, pagination)  |
| `youtrack_kb_get_article`    | Get one article by id                         |
| `youtrack_kb_create_article` | Create article (summary, content, project)    |
| `youtrack_kb_update_article` | Update article summary and/or content         |

**Issues & commands:**

| Tool                              | Description                                           |
|-----------------------------------|-------------------------------------------------------|
| `youtrack_search_issues`          | Search issues (YouTrack query language, pagination)   |
| `youtrack_get_issue`              | Get one issue by id                                   |
| `youtrack_create_issue`           | Create issue (shortName or internal project id)       |
| `youtrack_update_issue`           | Update issue summary / description                    |
| `youtrack_update_issue_state`     | Change issue state (auto-wraps multi-word values)     |
| `youtrack_execute_command`        | Execute arbitrary YouTrack command on an issue        |
| `youtrack_change_issue_assignee`  | Change assignee (auto-wraps multi-word names)         |
| `youtrack_add_issue_comment`      | Add comment to an issue                               |
| `youtrack_get_issue_comments`     | List issue comments                                   |
| `youtrack_get_issue_fields_schema`| Get custom fields schema for a project                |
| `youtrack_manage_issue_tags`      | Add / remove tags (auto-wraps multi-word tags)        |
| `youtrack_link_issues`            | Link two issues (Subtask of, depends on, etc.)        |

**Projects, users, groups, time tracking, saved searches** — see `server.mjs` `ListTools` handler for the full list.

## Tests

```bash
npm test
```

Unit tests cover CommandList payload shape (`issues` required) and `projectId` normalization.

## Roadmap towards official MCP parity

High-level plan (details in ONBOARDING and project notes):

- **Research official YouTrack MCP**: list tools, their arguments and expected outputs.
- **Map each tool to YouTrack HTTP API**: identify REST endpoints or combinations for issues, search, projects, users, KB, etc.
- **Implement HTTP-based tools**: add MCP tools with structured input schemas and consistent JSON outputs.
- **Align UX and naming**: keep tool names, descriptions and semantics as close as reasonable to the official MCP, within HTTP API constraints.
- **Harden and document**: better error handling, timeouts, pagination, and examples for typical AI-assistant workflows.

## License

MIT

