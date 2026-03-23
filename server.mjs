#!/usr/bin/env node
/**
 * MCP server for YouTrack over HTTP API.
 *
 * Initial scope: Knowledge Base (Articles), cloned from youtrack-kb-mcp.
 * Future scope: extend to issues and other entities to mirror the official YouTrack MCP.
 *
 * Requires env:
 * - YOUTRACK_URL  (base URL, e.g. https://youtrack.example.com)
 * - YOUTRACK_TOKEN (Bearer token)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  buildCommandsRequestBody,
  buildLinkCommandQuery,
  projectPayloadForCreateIssue,
  wrapCommandValue
} from './lib/youtrack-helpers.mjs';

const baseUrl = (process.env.YOUTRACK_URL || '').replace(/\/$/, '');
const token = process.env.YOUTRACK_TOKEN;
const api = baseUrl ? `${baseUrl}/api` : '';

function authHeaders() {
  if (!baseUrl) throw new Error('YOUTRACK_URL is required');
  if (!token) throw new Error('YOUTRACK_TOKEN is required');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function ytFetch(path, opts = {}) {
  const headers = { ...authHeaders(), ...opts.headers };
  const res = await fetch(`${api}${path}`, { ...opts, headers });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 400) {
      const { Authorization: _a, ...safeHeaders } = headers;
      const requestBody =
        typeof opts.body === 'string' ? opts.body : opts.body != null ? JSON.stringify(opts.body) : undefined;
      console.error(
        '[youtrack-http-api-mcp] HTTP 400 (full response + request payload, Authorization redacted)',
        JSON.stringify(
          {
            path,
            method: opts.method || 'GET',
            requestHeaders: safeHeaders,
            requestBody,
            responseBody: text
          },
          null,
          2
        )
      );
    }
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

/** Apply YouTrack command via POST /api/commands (requires CommandList.issues). */
async function ytApplyCommand(query, issueIds, extra = {}) {
  const body = buildCommandsRequestBody(query, issueIds, extra);
  return ytFetch('/commands?fields=id,query,issues(id,idReadable,summary)', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

function jsonContent(value) {
  return [
    {
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    }
  ];
}

const server = new Server(
  { name: 'youtrack-http-api-mcp', version: '0.3.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // Knowledge Base (articles) – расширение относительно официального MCP
    {
      name: 'youtrack_kb_list_articles',
      description:
        'List YouTrack Knowledge Base articles. Optional filter by project (projectShortName), pagination: top and skip.',
      inputSchema: {
        type: 'object',
        properties: {
          projectShortName: { type: 'string', description: 'Project key, e.g. GEN' },
          top: { type: 'number', description: 'Max articles (default 50)', default: 50 },
          skip: { type: 'number', description: 'Skip N articles for pagination (default 0)', default: 0 }
        }
      }
    },
    {
      name: 'youtrack_kb_get_article',
      description: 'Get a single article by id (e.g. GEN-A-1 or database id).',
      inputSchema: {
        type: 'object',
        properties: { articleId: { type: 'string', description: 'Article id (idReadable or id)' } },
        required: ['articleId']
      }
    },
    {
      name: 'youtrack_kb_create_article',
      description: 'Create an article in YouTrack Knowledge Base in the given project.',
      inputSchema: {
        type: 'object',
        properties: {
          projectShortName: { type: 'string', description: 'Project key', default: 'GEN' },
          summary: { type: 'string', description: 'Article title' },
          content: { type: 'string', description: 'Article body (Markdown)' }
        },
        required: ['summary']
      }
    },
    {
      name: 'youtrack_kb_update_article',
      description: 'Update an article (summary and/or content). At least one of summary or content must be provided.',
      inputSchema: {
        type: 'object',
        properties: {
          articleId: { type: 'string', description: 'Article id' },
          summary: { type: 'string', description: 'New title' },
          content: { type: 'string', description: 'New body (Markdown)' }
        },
        required: ['articleId']
      }
    },

    // Issues / search
    {
      name: 'youtrack_search_issues',
      description: 'Search issues using YouTrack query language.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'YouTrack search query' },
          top: { type: 'number', description: 'Max issues (default 50)', default: 50 },
          skip: { type: 'number', description: 'Skip N issues for pagination', default: 0 }
        }
      }
    },
    {
      name: 'youtrack_get_issue',
      description: 'Get a single issue by id or shortId.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Issue id or readable id (e.g. PRJ-1)' }
        },
        required: ['id']
      }
    },
    {
      name: 'youtrack_create_issue',
      description:
        'Create a new issue in YouTrack. projectId: use project shortName (e.g. IAG) or internal id (e.g. 81-219); shortName is sent as project.shortName, numeric id as project.id.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project shortName (IAG) or internal id (81-219)', default: '' },
          summary: { type: 'string', description: 'Issue summary' },
          description: { type: 'string', description: 'Issue description (optional)' },
          type: { type: 'string', description: 'Issue type name (optional)' }
        },
        required: ['summary']
      }
    },
    {
      name: 'youtrack_update_issue',
      description: 'Update basic fields of an issue (summary, description).',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Issue id or readable id (e.g. PRJ-1)' },
          summary: { type: 'string', description: 'New summary' },
          description: { type: 'string', description: 'New description' }
        },
        required: ['id']
      }
    },
    {
      name: 'youtrack_change_issue_assignee',
      description: 'Change issue assignee using Commands API.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Issue id or readable id (e.g. PRJ-1)' },
          assignee: { type: 'string', description: 'User login or full name' }
        },
        required: ['id', 'assignee']
      }
    },
    {
      name: 'youtrack_add_issue_comment',
      description: 'Add a comment to an issue.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Issue id or readable id (e.g. PRJ-1)' },
          text: { type: 'string', description: 'Comment text' }
        },
        required: ['id', 'text']
      }
    },
    {
      name: 'youtrack_get_issue_comments',
      description: 'List comments of an issue.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Issue id or readable id (e.g. PRJ-1)' },
          top: { type: 'number', description: 'Max comments (default 50)', default: 50 },
          skip: { type: 'number', description: 'Skip N comments', default: 0 }
        },
        required: ['id']
      }
    },
    {
      name: 'youtrack_get_issue_fields_schema',
      description: 'Get custom fields schema for a project (issue fields).',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project id or shortName' }
        },
        required: ['projectId']
      }
    },
    {
      name: 'youtrack_manage_issue_tags',
      description:
        'Add or remove tags on an issue via Commands API (POST /api/commands with query + issues[]). Use id or idReadable (e.g. PRJ-1).',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Issue id or readable id (e.g. PRJ-1)' },
          add: {
            type: 'array',
            description: 'Tag names to add',
            items: { type: 'string' }
          },
          remove: {
            type: 'array',
            description: 'Tag names to remove',
            items: { type: 'string' }
          }
        },
        required: ['id']
      }
    },
    {
      name: 'youtrack_link_issues',
      description:
        'Link two issues via Commands API. Command is applied to sourceId; use linkType as in your YouTrack (e.g. "Subtask of", "depends on", "relates to"). Multi-word types are sent as-is; single-word types become "link <type> <target>".',
      inputSchema: {
        type: 'object',
        properties: {
          sourceId: { type: 'string', description: 'Issue the command applies to (child for Subtask of)' },
          targetId: { type: 'string', description: 'Other issue id or idReadable (e.g. PRJ-2)' },
          linkType: {
            type: 'string',
            description: 'e.g. "Subtask of", "depends on", "relates to" (must match link names in your instance)'
          }
        },
        required: ['sourceId', 'targetId', 'linkType']
      }
    },

    // Generic command execution
    {
      name: 'youtrack_execute_command',
      description:
        'Execute an arbitrary YouTrack command on an issue via Commands API (e.g. "State {Can be test}", "priority Critical", "Type Bug"). Values with spaces must use YouTrack {braces} syntax inside the command string.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Issue id or readable id (e.g. PRJ-1)' },
          command: { type: 'string', description: 'YouTrack command string (e.g. "State {In Progress}", "fixed", "priority Critical")' }
        },
        required: ['id', 'command']
      }
    },
    {
      name: 'youtrack_update_issue_state',
      description:
        'Change issue state/status. Automatically wraps multi-word state names in {braces} for YouTrack Commands API (e.g. state "Can be test" → command "State {Can be test}").',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Issue id or readable id (e.g. PRJ-1)' },
          state: { type: 'string', description: 'Target state name (e.g. "Can be test", "Fixed", "In Progress")' }
        },
        required: ['id', 'state']
      }
    },

    // Projects
    {
      name: 'youtrack_find_projects',
      description: 'Find projects by name or shortName.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Substring of name or shortName' },
          top: { type: 'number', description: 'Max projects (default 50)', default: 50 },
          skip: { type: 'number', description: 'Skip N projects', default: 0 }
        }
      }
    },
    {
      name: 'youtrack_get_project',
      description: 'Get project by id or shortName.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Project id or shortName' }
        },
        required: ['id']
      }
    },

    // Users
    {
      name: 'youtrack_find_user',
      description: 'Find users by login, email or name.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for users' },
          top: { type: 'number', description: 'Max users (default 50)', default: 50 },
          skip: { type: 'number', description: 'Skip N users', default: 0 }
        },
        required: ['query']
      }
    },
    {
      name: 'youtrack_get_current_user',
      description: 'Get current authenticated YouTrack user.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },

    // Groups
    {
      name: 'youtrack_find_user_groups',
      description: 'Find user groups by name.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Substring of group name' },
          top: { type: 'number', description: 'Max groups (default 50)', default: 50 },
          skip: { type: 'number', description: 'Skip N groups', default: 0 }
        }
      }
    },
    {
      name: 'youtrack_get_user_group_members',
      description: 'Get members of a user group.',
      inputSchema: {
        type: 'object',
        properties: {
          groupId: { type: 'string', description: 'Group id or name' },
          top: { type: 'number', description: 'Max users (default 50)', default: 50 },
          skip: { type: 'number', description: 'Skip N users', default: 0 }
        },
        required: ['groupId']
      }
    },

    // Time tracking
    {
      name: 'youtrack_log_work',
      description: 'Log work item (time tracking) for an issue.',
      inputSchema: {
        type: 'object',
        properties: {
          issueId: { type: 'string', description: 'Issue id or readable id (e.g. PRJ-1)' },
          durationMinutes: { type: 'number', description: 'Duration in minutes' },
          description: { type: 'string', description: 'Work description' },
          date: { type: 'string', description: 'ISO date string (optional, default: now)' }
        },
        required: ['issueId', 'durationMinutes']
      }
    },

    // Saved searches
    {
      name: 'youtrack_get_saved_issue_searches',
      description: 'Get saved issue searches (saved queries).',
      inputSchema: {
        type: 'object',
        properties: {
          top: { type: 'number', description: 'Max saved searches (default 50)', default: 50 },
          skip: { type: 'number', description: 'Skip N saved searches', default: 0 }
        }
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const a = args || {};

  try {
    // KB tools
    if (name === 'youtrack_kb_list_articles') {
      const project = a.projectShortName;
      const top = Math.max(1, Math.min(100, Number(a.top) || 50));
      const skip = Math.max(0, Number(a.skip) || 0);
      const q = `fields=id,idReadable,summary,project(shortName),updated&$top=${top}&$skip=${skip}`;
      const path = project
        ? `/admin/projects/${encodeURIComponent(project)}/articles?${q}`
        : `/articles?${q}`;
      const data = await ytFetch(path);
      return { content: jsonContent(Array.isArray(data) ? data : []) };
    }

    if (name === 'youtrack_kb_get_article') {
      const id = a.articleId;
      if (!id) throw new Error('articleId is required');
      const data = await ytFetch(
        `/articles/${encodeURIComponent(id)}?fields=id,idReadable,summary,content,project(shortName),updated`
      );
      return { content: jsonContent(data) };
    }

    if (name === 'youtrack_kb_create_article') {
      const projectShortName = a.projectShortName || 'GEN';
      const summary = a.summary || '';
      const content = a.content || '';
      const body = { project: { shortName: projectShortName }, summary, content };
      const data = await ytFetch('/articles?fields=id,idReadable,summary', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      return { content: jsonContent(data) };
    }

    if (name === 'youtrack_kb_update_article') {
      const articleId = a.articleId;
      if (!articleId) throw new Error('articleId is required');
      const body = {};
      if (a.summary != null) body.summary = a.summary;
      if (a.content != null) body.content = a.content;
      if (Object.keys(body).length === 0) throw new Error('Provide at least one of summary or content');
      const data = await ytFetch(`/articles/${encodeURIComponent(articleId)}?fields=id,idReadable,summary`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      return { content: jsonContent({ updated: articleId, result: data }) };
    }

    // Issues / search
    if (name === 'youtrack_search_issues') {
      const query = a.query || '';
      const top = Math.max(1, Math.min(100, Number(a.top) || 50));
      const skip = Math.max(0, Number(a.skip) || 0);
      const q = `query=${encodeURIComponent(query)}&$top=${top}&$skip=${skip}` +
        '&fields=id,idReadable,summary,description,project(shortName),created,updated,assignee(name,login),state(name)';
      const data = await ytFetch(`/issues?${q}`);
      return { content: jsonContent(Array.isArray(data) ? data : []) };
    }

    if (name === 'youtrack_get_issue') {
      const id = a.id;
      if (!id) throw new Error('id is required');
      const data = await ytFetch(
        `/issues/${encodeURIComponent(id)}?fields=id,idReadable,summary,description,project(shortName),created,updated,assignee(name,login),state(name)`
      );
      return { content: jsonContent(data) };
    }

    if (name === 'youtrack_create_issue') {
      const summary = a.summary;
      if (!summary) throw new Error('summary is required');
      const projectId = a.projectId || '';
      const description = a.description || '';
      const type = a.type || '';
      const project = projectPayloadForCreateIssue(projectId);
      const body = {
        ...(project ? { project } : {}),
        summary,
        description,
        ...(type ? { customFields: [{ name: 'Type', $type: 'SingleEnumIssueCustomField', value: { name: type } }] } : {})
      };
      const data = await ytFetch(
        '/issues?fields=id,idReadable,summary,project(shortName),description,created,updated',
        { method: 'POST', body: JSON.stringify(body) }
      );
      return { content: jsonContent(data) };
    }

    if (name === 'youtrack_update_issue') {
      const id = a.id;
      if (!id) throw new Error('id is required');
      const patch = {};
      if (a.summary != null) patch.summary = a.summary;
      if (a.description != null) patch.description = a.description;
      if (Object.keys(patch).length === 0) throw new Error('Provide at least one of summary or description');
      const data = await ytFetch(
        `/issues/${encodeURIComponent(id)}?fields=id,idReadable,summary,description,updated`,
        { method: 'POST', body: JSON.stringify(patch) }
      );
      return { content: jsonContent(data) };
    }

    if (name === 'youtrack_change_issue_assignee') {
      const id = a.id;
      const assignee = a.assignee;
      if (!id || !assignee) throw new Error('id and assignee are required');
      const query = `Assignee ${wrapCommandValue(assignee)}`;
      const data = await ytApplyCommand(query, [id]);
      return { content: jsonContent({ query, issues: [id], result: data }) };
    }

    if (name === 'youtrack_add_issue_comment') {
      const id = a.id;
      const text = a.text;
      if (!id || !text) throw new Error('id and text are required');
      const body = { text };
      const data = await ytFetch(
        `/issues/${encodeURIComponent(id)}/comments?fields=id,text,created,updated,author(name,login)`,
        { method: 'POST', body: JSON.stringify(body) }
      );
      return { content: jsonContent(data) };
    }

    if (name === 'youtrack_get_issue_comments') {
      const id = a.id;
      if (!id) throw new Error('id is required');
      const top = Math.max(1, Math.min(100, Number(a.top) || 50));
      const skip = Math.max(0, Number(a.skip) || 0);
      const q = `$top=${top}&$skip=${skip}&fields=id,text,created,updated,author(name,login)`;
      const data = await ytFetch(`/issues/${encodeURIComponent(id)}/comments?${q}`);
      return { content: jsonContent(Array.isArray(data) ? data : []) };
    }

    if (name === 'youtrack_get_issue_fields_schema') {
      const projectId = a.projectId;
      if (!projectId) throw new Error('projectId is required');
      const q = 'fields=field(name,id),project(id,shortName)';
      const data = await ytFetch(`/admin/projects/${encodeURIComponent(projectId)}/customFields?${q}`);
      return { content: jsonContent(Array.isArray(data) ? data : []) };
    }

    if (name === 'youtrack_manage_issue_tags') {
      const id = a.id;
      if (!id) throw new Error('id is required');
      const add = Array.isArray(a.add) ? a.add : [];
      const remove = Array.isArray(a.remove) ? a.remove : [];
      if (!add.length && !remove.length) throw new Error('Specify at least one tag to add or remove');
      const parts = [];
      if (add.length) parts.push(`tag ${add.map(wrapCommandValue).join(', ')}`);
      if (remove.length) parts.push(`untag ${remove.map(wrapCommandValue).join(', ')}`);
      const query = parts.join(' ');
      const data = await ytApplyCommand(query, [id]);
      return { content: jsonContent({ query, issues: [id], result: data }) };
    }

    if (name === 'youtrack_link_issues') {
      const sourceId = a.sourceId;
      const targetId = a.targetId;
      const linkType = a.linkType;
      if (!sourceId || !targetId || !linkType) throw new Error('sourceId, targetId and linkType are required');
      const query = buildLinkCommandQuery(linkType, targetId);
      const data = await ytApplyCommand(query, [sourceId]);
      return { content: jsonContent({ query, issues: [sourceId], targetId, linkType, result: data }) };
    }

    // Generic command execution
    if (name === 'youtrack_execute_command') {
      const id = a.id;
      const command = a.command;
      if (!id || !command) throw new Error('id and command are required');
      const data = await ytApplyCommand(command, [id]);
      return { content: jsonContent({ command, issues: [id], result: data }) };
    }

    if (name === 'youtrack_update_issue_state') {
      const id = a.id;
      const state = a.state;
      if (!id || !state) throw new Error('id and state are required');
      const query = `State ${wrapCommandValue(state)}`;
      const data = await ytApplyCommand(query, [id]);
      return { content: jsonContent({ query, issues: [id], result: data }) };
    }

    // Projects
    if (name === 'youtrack_find_projects') {
      const query = (a.query || '').toLowerCase();
      const top = Math.max(1, Math.min(100, Number(a.top) || 50));
      const skip = Math.max(0, Number(a.skip) || 0);
      const q = 'fields=id,shortName,name,description&$top=200&$skip=0';
      const all = await ytFetch(`/admin/projects?${q}`);
      const filtered = (Array.isArray(all) ? all : []).filter((p) => {
        if (!query) return true;
        return (
          (p.name && p.name.toLowerCase().includes(query)) ||
          (p.shortName && p.shortName.toLowerCase().includes(query))
        );
      });
      const sliced = filtered.slice(skip, skip + top);
      return { content: jsonContent(sliced) };
    }

    if (name === 'youtrack_get_project') {
      const id = a.id;
      if (!id) throw new Error('id is required');
      const data = await ytFetch(
        `/admin/projects/${encodeURIComponent(id)}?fields=id,shortName,name,description,leader(name,login)`
      );
      return { content: jsonContent(data) };
    }

    // Users
    if (name === 'youtrack_find_user') {
      const query = a.query;
      if (!query) throw new Error('query is required');
      const top = Math.max(1, Math.min(100, Number(a.top) || 50));
      const skip = Math.max(0, Number(a.skip) || 0);
      const q = `query=${encodeURIComponent(query)}&fields=id,login,fullName,email&$top=${top}&$skip=${skip}`;
      const data = await ytFetch(`/users?${q}`);
      return { content: jsonContent(Array.isArray(data) ? data : []) };
    }

    if (name === 'youtrack_get_current_user') {
      const data = await ytFetch('/users/me?fields=id,login,fullName,email');
      return { content: jsonContent(data) };
    }

    // Groups
    if (name === 'youtrack_find_user_groups') {
      const query = (a.query || '').toLowerCase();
      const top = Math.max(1, Math.min(100, Number(a.top) || 50));
      const skip = Math.max(0, Number(a.skip) || 0);
      const q = 'fields=id,name,description&$top=200&$skip=0';
      const all = await ytFetch(`/groups?${q}`);
      const filtered = (Array.isArray(all) ? all : []).filter((g) => {
        if (!query) return true;
        return g.name && g.name.toLowerCase().includes(query);
      });
      const sliced = filtered.slice(skip, skip + top);
      return { content: jsonContent(sliced) };
    }

    if (name === 'youtrack_get_user_group_members') {
      const groupId = a.groupId;
      if (!groupId) throw new Error('groupId is required');
      const top = Math.max(1, Math.min(100, Number(a.top) || 50));
      const skip = Math.max(0, Number(a.skip) || 0);
      const q = `$top=${top}&$skip=${skip}&fields=id,login,fullName,email`;
      const data = await ytFetch(`/groups/${encodeURIComponent(groupId)}/users?${q}`);
      return { content: jsonContent(Array.isArray(data) ? data : []) };
    }

    // Time tracking
    if (name === 'youtrack_log_work') {
      const issueId = a.issueId;
      const durationMinutes = Number(a.durationMinutes);
      if (!issueId || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        throw new Error('issueId and positive durationMinutes are required');
      }
      const description = a.description || '';
      const date = a.date ? new Date(a.date) : new Date();
      const body = {
        issue: { id: issueId, idReadable: issueId },
        duration: { minutes: durationMinutes },
        text: description,
        date: date.toISOString()
      };
      const data = await ytFetch(
        '/workItems?fields=id,issue(id,idReadable),duration(minutes),date,text,creator(name,login)',
        { method: 'POST', body: JSON.stringify(body) }
      );
      return { content: jsonContent(data) };
    }

    // Saved searches
    if (name === 'youtrack_get_saved_issue_searches') {
      const top = Math.max(1, Math.min(100, Number(a.top) || 50));
      const skip = Math.max(0, Number(a.skip) || 0);
      const q = `$top=${top}&$skip=${skip}&fields=id,name,query,owner(name,login)`;
      const data = await ytFetch(`/savedQueries?${q}`);
      return { content: jsonContent(Array.isArray(data) ? data : []) };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

