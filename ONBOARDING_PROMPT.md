# Onboarding: youtrack-http-api-mcp

This repo is an MCP server for YouTrack that talks directly to the **YouTrack HTTP API** instead of the official JSON-RPC-based MCP implementation. The long-term goal is to mirror the useful surface of the official YouTrack MCP (issues, search, KB, etc.) where there is a reasonable mapping to documented REST endpoints.

- **Setup:** clone, `npm install`, set `YOUTRACK_URL` and `YOUTRACK_TOKEN`, then add the server to your MCP config (see `README.md`).
- **Code:** `server.mjs` is the entry point. Initially it contains only the Knowledge Base (Articles) tools cloned from `youtrack-kb-mcp`; additional domains (issues, projects, search) will be added incrementally.
- **Configuration:** no hardcoded URLs or tokens — everything comes from environment variables so the same code can be used against different YouTrack instances.

## Контекст в экосистеме ~/ai/

Проект живёт в `~/ai/youtrack-http-api-mcp` и входит в общий воркспейс `~/ai/general/ai.code-workspace`.

- В `.cursor/mcp.json` проекта установлен симлинк на `../../general/.cursor/mcp.json`, чтобы при работе в этом репо подхватывались общие MCP (GitLab, YouTrack, Engram и др.).
- В `.cursor/rules/` лежат симлинки на общие правила из `~/ai/general/.cursor/rules/*.mdc`, включая правила по созданию новых проектов и работе с MCP.

## Задача проекта (формулировка для субагентов)

**Цель:** реализовать HTTP‑based MCP-сервер для YouTrack, который:

1. Использует официальный REST API YouTrack (`/api/...`) для всех операций.
2. Покрывает максимально возможный поднабор возможностей официального MCP YouTrack (issues, search, KB, projects и др.), сохраняя близкие имена и семантику инструментов.
3. Может использоваться в Cursor/других MCP-хостах как замена/обход проблем официального JSON-RPC MCP-плагина.

**Минимальные требования к реализации:**

- Чёткие `inputSchema` для всех инструментов.
- Структурированные ответы (JSON/structured text), пригодные для дальнейшей обработки моделью.
- Осмысленная обработка ошибок YouTrack API (HTTP-коды, текст ошибок, частичная диагностика).
- Поддержка пагинации и простых фильтров там, где возможны большие выборки (issues, search, KB).

