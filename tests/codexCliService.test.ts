import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExecArgs, parseJsonEventLine } from '../src/services/codexCliService.js';

test('Codex exec args include skip git repo check and json flags', () => {
  const args = buildExecArgs('hello');
  assert.deepEqual(args, ['exec', '--skip-git-repo-check', '--json', '--sandbox', 'read-only', 'hello']);
});

test('Codex exec args include workspace root when provided', () => {
  const args = buildExecArgs('hello', '/tmp/ws');
  assert.deepEqual(args, [
    'exec',
    '--skip-git-repo-check',
    '--json',
    '--sandbox',
    'read-only',
    '-C',
    '/tmp/ws',
    'hello'
  ]);
});

test('JSON event parser extracts assistant delta text only', () => {
  const parsed = parseJsonEventLine('{"type":"response.output_text.delta","delta":"hello"}');
  assert.equal(parsed.isJson, true);
  assert.equal(parsed.textDelta, 'hello');
  assert.equal(parsed.finalText, '');
  assert.equal(parsed.tokensUsed, undefined);
});

test('JSON event parser extracts token usage from response usage', () => {
  const parsed = parseJsonEventLine('{"type":"response.completed","response":{"usage":{"input_tokens":12,"output_tokens":30}}}');
  assert.equal(parsed.isJson, true);
  assert.equal(parsed.textDelta, '');
  assert.equal(parsed.finalText, '');
  assert.equal(parsed.tokensUsed, 42);
  assert.equal(parsed.inputTokens, 12);
  assert.equal(parsed.outputTokens, 30);
});

test('JSON event parser ignores non-json lines', () => {
  const parsed = parseJsonEventLine('plain text stderr output');
  assert.equal(parsed.isJson, false);
  assert.equal(parsed.textDelta, '');
  assert.equal(parsed.finalText, '');
  assert.equal(parsed.tokensUsed, undefined);
});

test('JSON event parser extracts final assistant text from output_item.done', () => {
  const parsed = parseJsonEventLine(
    '{"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"done text"}]}}'
  );
  assert.equal(parsed.isJson, true);
  assert.equal(parsed.textDelta, '');
  assert.equal(parsed.finalText, 'done text');
});

test('JSON event parser extracts assistant delta when delta is object', () => {
  const parsed = parseJsonEventLine(
    '{"type":"response.output_text.delta","delta":{"text":"chunk-1"}}'
  );
  assert.equal(parsed.isJson, true);
  assert.equal(parsed.textDelta, 'chunk-1');
});

test('JSON event parser extracts final assistant text from response output array', () => {
  const parsed = parseJsonEventLine(
    '{"type":"response.completed","response":{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"final answer"}]}]}}'
  );
  assert.equal(parsed.isJson, true);
  assert.equal(parsed.finalText, 'final answer');
});

test('JSON event parser handles data-prefixed json line', () => {
  const parsed = parseJsonEventLine(
    'data: {"type":"response.output_text.delta","delta":"hello from data"}'
  );
  assert.equal(parsed.isJson, true);
  assert.equal(parsed.textDelta, 'hello from data');
});

test('JSON event parser handles log-prefixed json line', () => {
  const parsed = parseJsonEventLine(
    '2026-02-19T18:00:00Z INFO {"type":"response.output_text.delta","delta":"hello from log"}'
  );
  assert.equal(parsed.isJson, true);
  assert.equal(parsed.textDelta, 'hello from log');
});

test('JSON event parser extracts agent_message from item.completed format', () => {
  const parsed = parseJsonEventLine(
    '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"I found the issue and prepared a fix."}}'
  );
  assert.equal(parsed.isJson, true);
  assert.equal(parsed.textDelta, 'I found the issue and prepared a fix.');
});

test('JSON event parser ignores command_execution item.completed output', () => {
  const parsed = parseJsonEventLine(
    '{"type":"item.completed","item":{"id":"item_2","type":"command_execution","aggregated_output":"ls -la","status":"completed"}}'
  );
  assert.equal(parsed.isJson, true);
  assert.equal(parsed.textDelta, '');
});

test('JSON event parser extracts usage from turn.completed format', () => {
  const parsed = parseJsonEventLine(
    '{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":40}}'
  );
  assert.equal(parsed.isJson, true);
  assert.equal(parsed.tokensUsed, 140);
  assert.equal(parsed.inputTokens, 100);
  assert.equal(parsed.outputTokens, 40);
});
