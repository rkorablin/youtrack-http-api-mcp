/**
 * Pure helpers for YouTrack REST API (CommandList, project references).
 * @see https://www.jetbrains.com/help/youtrack/devportal/resource-api-commands.html
 */

/**
 * Build Issue stub for CommandList.issues (id or idReadable).
 * @param {string} issueId
 * @returns {{ id: string } | { idReadable: string }}
 */
export function issueRef(issueId) {
  if (issueId == null || String(issueId).trim() === '') {
    throw new Error('issue id is required');
  }
  const s = String(issueId).trim();
  // YouTrack database ids are typically "2-15" (digits-hyphen-digits). Readable: "PRJ-42".
  if (/^\d+-\d+$/.test(s)) return { id: s };
  return { idReadable: s };
}

/**
 * POST /api/commands body: query + issues (required by API).
 * @param {string} query command text without leading "for: <issue>"
 * @param {string[]} issueIds issue ids / idReadables
 * @param {Record<string, unknown>} [extra] silent, comment, visibility, etc.
 */
export function buildCommandsRequestBody(query, issueIds, extra = {}) {
  if (!query || String(query).trim() === '') {
    throw new Error('command query is required');
  }
  const ids = Array.isArray(issueIds) ? issueIds : [];
  if (ids.length === 0) {
    throw new Error('at least one issue id is required for CommandList.issues');
  }
  return {
    query: String(query).trim(),
    issues: ids.map(issueRef),
    ...extra
  };
}

/**
 * Link command applied to source issue: e.g. "Subtask of TARGET", "depends on TARGET".
 * If linkType already contains spaces (phrase), use as-is; otherwise prefix with "link".
 * @param {string} linkType e.g. "Subtask of", "depends on", "relates to"
 * @param {string} targetId target issue id or idReadable
 */
export function buildLinkCommandQuery(linkType, targetId) {
  if (!targetId || String(targetId).trim() === '') {
    throw new Error('targetId is required');
  }
  const lt = String(linkType || '').trim();
  if (!lt) throw new Error('linkType is required');
  const t = String(targetId).trim();
  if (/\s/.test(lt)) return `${lt} ${t}`;
  return `link ${lt} ${t}`;
}

/**
 * Wrap a command value in `{}` if it contains spaces and is not already wrapped.
 * YouTrack Commands API requires `{value with spaces}` syntax for multi-word values.
 * @param {string} value
 * @returns {string}
 */
export function wrapCommandValue(value) {
  const s = String(value ?? '').trim();
  if (!s) return s;
  if (s.startsWith('{') && s.endsWith('}')) return s;
  if (!/\s/.test(s)) return s;
  return `{${s}}`;
}

/**
 * Project field for POST /api/issues — do not send both id and shortName with the same value.
 * @param {string} projectId internal id "81-219" or shortName "IAG"
 */
export function projectPayloadForCreateIssue(projectId) {
  if (projectId == null || String(projectId).trim() === '') return undefined;
  const s = String(projectId).trim();
  if (/^\d+-\d+$/.test(s)) return { id: s };
  return { shortName: s };
}
