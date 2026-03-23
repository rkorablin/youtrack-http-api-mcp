import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  issueRef,
  buildCommandsRequestBody,
  buildLinkCommandQuery,
  projectPayloadForCreateIssue,
  wrapCommandValue
} from '../lib/youtrack-helpers.mjs';

describe('issueRef', () => {
  test('database id → { id }', () => {
    assert.deepEqual(issueRef('2-15'), { id: '2-15' });
    assert.deepEqual(issueRef('81-219'), { id: '81-219' });
  });

  test('readable id → { idReadable }', () => {
    assert.deepEqual(issueRef('IAG-42'), { idReadable: 'IAG-42' });
    assert.deepEqual(issueRef('PRJ-1'), { idReadable: 'PRJ-1' });
  });

  test('rejects empty', () => {
    assert.throws(() => issueRef(''), /required/);
    assert.throws(() => issueRef('   '), /required/);
  });
});

describe('buildCommandsRequestBody (CommandList.issues)', () => {
  test('includes issues array required by API', () => {
    const body = buildCommandsRequestBody('tag ci', ['IAG-1']);
    assert.equal(body.query, 'tag ci');
    assert.ok(Array.isArray(body.issues));
    assert.deepEqual(body.issues, [{ idReadable: 'IAG-1' }]);
  });

  test('multiple issues', () => {
    const body = buildCommandsRequestBody('Fixed', ['2-10', 'PRJ-2']);
    assert.deepEqual(body.issues, [{ id: '2-10' }, { idReadable: 'PRJ-2' }]);
  });

  test('merges silent/comment extras', () => {
    const body = buildCommandsRequestBody('for me', ['X-1'], { silent: true, comment: 'note' });
    assert.equal(body.silent, true);
    assert.equal(body.comment, 'note');
  });

  test('rejects missing query or issues', () => {
    assert.throws(() => buildCommandsRequestBody('', ['A-1']), /query/);
    assert.throws(() => buildCommandsRequestBody('tag x', []), /issues/);
  });
});

describe('buildLinkCommandQuery', () => {
  test('multi-word linkType used as phrase', () => {
    assert.equal(buildLinkCommandQuery('Subtask of', 'IAG-1'), 'Subtask of IAG-1');
    assert.equal(buildLinkCommandQuery('depends on', 'IAG-2'), 'depends on IAG-2');
  });

  test('single token gets link prefix', () => {
    assert.equal(buildLinkCommandQuery('relates', 'IAG-9'), 'link relates IAG-9');
  });
});

describe('wrapCommandValue', () => {
  test('single word → no wrapping', () => {
    assert.equal(wrapCommandValue('Fixed'), 'Fixed');
    assert.equal(wrapCommandValue('Critical'), 'Critical');
  });

  test('multi-word → wraps in {}', () => {
    assert.equal(wrapCommandValue('Can be test'), '{Can be test}');
    assert.equal(wrapCommandValue('In Progress'), '{In Progress}');
  });

  test('already wrapped → no double wrapping', () => {
    assert.equal(wrapCommandValue('{Can be test}'), '{Can be test}');
  });

  test('empty / null → empty string', () => {
    assert.equal(wrapCommandValue(''), '');
    assert.equal(wrapCommandValue(null), '');
    assert.equal(wrapCommandValue(undefined), '');
  });

  test('trims whitespace', () => {
    assert.equal(wrapCommandValue('  Fixed  '), 'Fixed');
    assert.equal(wrapCommandValue('  In Progress  '), '{In Progress}');
  });
});

describe('projectPayloadForCreateIssue', () => {
  test('numeric internal id', () => {
    assert.deepEqual(projectPayloadForCreateIssue('81-219'), { id: '81-219' });
  });

  test('shortName', () => {
    assert.deepEqual(projectPayloadForCreateIssue('IAG'), { shortName: 'IAG' });
  });

  test('empty → undefined', () => {
    assert.equal(projectPayloadForCreateIssue(''), undefined);
    assert.equal(projectPayloadForCreateIssue(undefined), undefined);
  });
});
