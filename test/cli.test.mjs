import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  browserEnvironment,
  doctor,
  helpText,
  parseArgs,
  VERSION,
} from '../src/cli.mjs';

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

test('derives the CLI version from package.json', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.equal(VERSION, packageJson.version);
});

test('doctor honors backend overrides and reports readiness', async () => {
  const calls = [];
  const result = await doctor({
    agentBrowserCommand: 'custom-agent-browser',
    bskCommand: 'custom-bsk',
    env: { OPENROUTER_API_KEY: 'set' },
    runProcessImpl: async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: `${command} 1.0.0`, stderr: '' };
    },
  });

  assert.equal(result.ready, true);
  assert.equal(result.commands.agentBrowser.installed, true);
  assert.equal(result.commands.bsk.installed, true);
  assert.deepEqual(result.nextSteps, []);
  assert.deepEqual(calls, [
    ['custom-agent-browser', '--version'],
    ['custom-bsk', '--version'],
  ]);
});

test('doctor honors a custom provider key variable', async () => {
  const result = await doctor({
    apiKeyEnv: 'CUSTOM_PROVIDER_API_KEY',
    env: { CUSTOM_PROVIDER_API_KEY: 'set' },
    runProcessImpl: async (command) => ({ stdout: `${command} 1.0.0`, stderr: '' }),
  });

  assert.equal(result.ready, true);
  assert.equal(result.environment.CUSTOM_PROVIDER_API_KEY, true);
});

test('doctor reports an unusable setup when no backend or provider is available', async () => {
  const result = await doctor({
    env: {},
    runProcessImpl: async () => {
      throw Object.assign(new Error('not found'), { code: 'ENOENT' });
    },
  });

  assert.equal(result.ready, false);
  assert.ok(result.issues.includes('No supported browser backend is installed.'));
  assert.ok(result.issues.includes('No supported decision-provider API key is set.'));
  assert.equal(result.nextSteps.length, 2);
  assert.match(result.nextSteps[0], /agent-browser/);
  assert.match(result.nextSteps[1], /OPENROUTER_API_KEY/);
});

test('doctor suggests the key variable that a custom provider expects', async () => {
  const result = await doctor({
    apiKeyEnv: 'CUSTOM_PROVIDER_API_KEY',
    env: {},
    runProcessImpl: async (command) => ({ stdout: `${command} 1.0.0`, stderr: '' }),
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.issues, ['No supported decision-provider API key is set.']);
  assert.equal(result.nextSteps.length, 1);
  assert.match(result.nextSteps[0], /CUSTOM_PROVIDER_API_KEY/);
});

test('removes provider credentials from browser subprocess environments', () => {
  const env = browserEnvironment({
    PATH: '/bin',
    TYPESAFE_API_KEY: 'typesafe',
    OPENROUTER_API_KEY: 'openrouter',
    OPENAI_API_KEY: 'openai',
    CUSTOM_PROVIDER_API_KEY: 'custom',
  }, 'CUSTOM_PROVIDER_API_KEY');

  assert.deepEqual(env, { PATH: '/bin' });
});
