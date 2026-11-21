import test from 'node:test';
import assert from 'node:assert/strict';
import { helpText, parseArgs } from '../src/cli.mjs';

test('parses the unified backend and provider CLI', () => {
  const options = parseArgs([
    'run',
    '--backend', 'bsk',
    '--provider', 'openrouter',
    '--attach',
    '--bsk-scope', 'agent-test',
    '--goal', 'Find pricing',
    '--max-steps', '8',
  ]);

  assert.equal(options.backend, 'bsk');
  assert.equal(options.provider, 'openrouter');
  assert.equal(options.attach, true);
  assert.equal(options.bskScope, 'agent-test');
  assert.equal(options.maxSteps, 8);
});

test('rejects unknown commands and options', () => {
  assert.throws(() => parseArgs(['unknown']), (error) => error.code === 'INVALID_ARGUMENTS');
  assert.throws(() => parseArgs(['run', '--wat']), (error) => error.code === 'INVALID_ARGUMENTS');
});

test('accepts the documented doctor JSON flag', () => {
  const options = parseArgs(['doctor', '--json']);

  assert.equal(options.command, 'doctor');
  assert.equal(options.json, true);
});

test('documents the single browsemux entry point', () => {
  assert.match(helpText(), /browsemux run/);
  assert.match(helpText(), /browsemux skill install/);
  assert.match(helpText(), /agent-browser/);
  assert.match(helpText(), /bsk/);
  assert.match(helpText(), /typesafe/);
  assert.match(helpText(), /openrouter/);
});

test('parses portable skill installation options', () => {
  const options = parseArgs([
    'skill',
    'install',
    '--harness', 'codex,claude',
    '--scope', 'project',
    '--force',
  ]);

  assert.equal(options.command, 'skill');
  assert.equal(options.skillAction, 'install');
  assert.equal(options.harness, 'codex,claude');
  assert.equal(options.skillScope, 'project');
  assert.equal(options.force, true);
});
