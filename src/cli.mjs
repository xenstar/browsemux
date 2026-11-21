import { readFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveAgentBrowserInvocation } from './backends/agent-browser.mjs';
import { createBackend } from './backends/index.mjs';
import { createDecisionProvider } from './decisions/index.mjs';
import { BrowsemuxError, errorResult } from './errors.mjs';
import { normalizeInputs } from './inputs.mjs';
import { runLoop } from './loop.mjs';
import { installBrowsemuxSkill, skillSourcePath } from './skills.mjs';
import { parseJsonOption } from './util/json.mjs';
import { runProcess } from './util/process.mjs';

export const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;

const VALUE_OPTIONS = new Map([
  ['--backend', 'backend'],
  ['--provider', 'provider'],
  ['--url', 'url'],
  ['--goal', 'goal'],
  ['--max-steps', 'maxSteps'],
  ['--max-recovery', 'maxRecoveryAttempts'],
  ['--repeat-limit', 'repeatLimit'],
  ['--history-limit', 'historyLimit'],
  ['--max-candidates', 'maxCandidates'],
  ['--max-observation-chars', 'maxSnapshotChars'],
  ['--decision-timeout', 'decisionTimeoutMs'],
  ['--settle-timeout', 'settleTimeoutMs'],
  ['--model', 'model'],
  ['--endpoint', 'endpoint'],
  ['--api-key-env', 'apiKeyEnv'],
  ['--headers-json', 'headersJson'],
  ['--provider-routing-json', 'providerRoutingJson'],
  ['--structured-output', 'structuredOutput'],
  ['--inputs-json', 'inputsJson'],
  ['--success-url-contains', 'successUrlContains'],
  ['--success-text-contains', 'successTextContains'],
  ['--browser-command', 'browserCommand'],
  ['--browser-session', 'browserSession'],
  ['--bsk-command', 'bskCommand'],
  ['--bsk-scope', 'bskScope'],
  ['--bsk-session', 'bskSession'],
  ['--bsk-max-tokens', 'bskMaxTokens'],
  ['--harness', 'harness'],
  ['--scope', 'skillScope'],
]);

const BOOLEAN_OPTIONS = new Map([
  ['--attach', 'attach'],
  ['--keep-open', 'keepOpen'],
  ['--json', 'json'],
  ['--jsonl', 'jsonl'],
  ['--help', 'help'],
  ['-h', 'help'],
  ['--version', 'version'],
  ['-V', 'version'],
  ['--force', 'force'],
]);

const INTEGER_OPTIONS = new Set([
  'maxSteps',
  'maxRecoveryAttempts',
  'repeatLimit',
  'historyLimit',
  'maxCandidates',
  'maxSnapshotChars',
  'decisionTimeoutMs',
  'settleTimeoutMs',
  'bskMaxTokens',
]);

const SUPPORTED_BACKENDS = new Set(['agent-browser', 'bsk']);
const SUPPORTED_PROVIDERS = new Set(['typesafe', 'openrouter', 'openai']);

export function parseArgs(argv) {
  const args = [...argv];
  let command = 'run';
  let skillAction = 'install';
  if (args[0] && !args[0].startsWith('-')) {
    command = args.shift();
    if (command === 'skill' && args[0] && !args[0].startsWith('-')) {
      skillAction = args.shift();
    }
  }
  if (!['run', 'doctor', 'skill'].includes(command)) {
    throw new BrowsemuxError(`Unknown command: ${command}`, { code: 'INVALID_ARGUMENTS' });
  }
  if (command === 'skill' && !['install', 'path'].includes(skillAction)) {
    throw new BrowsemuxError(`Unknown skill command: ${skillAction}`, {
      code: 'INVALID_ARGUMENTS',
    });
  }

  const options = {
    command,
    skillAction,
    backend: 'agent-browser',
    provider: 'typesafe',
    maxSteps: 12,
    maxRecoveryAttempts: 2,
    repeatLimit: 2,
    historyLimit: 6,
    maxCandidates: 180,
    maxSnapshotChars: 18_000,
    decisionTimeoutMs: 30_000,
    settleTimeoutMs: 6_000,
    bskMaxTokens: 4_000,
    harness: 'all',
    skillScope: 'user',
    structuredOutput: 'json_object',
    attach: false,
    keepOpen: false,
    force: false,
    json: false,
    jsonl: false,
    help: false,
    version: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (BOOLEAN_OPTIONS.has(argument)) {
      options[BOOLEAN_OPTIONS.get(argument)] = true;
      continue;
    }
    const key = VALUE_OPTIONS.get(argument);
    if (!key) {
      throw new BrowsemuxError(`Unknown option: ${argument}`, { code: 'INVALID_ARGUMENTS' });
    }
    const value = args[++index];
    if (value === undefined) {
      throw new BrowsemuxError(`${argument} requires a value`, { code: 'INVALID_ARGUMENTS' });
    }
    options[key] = INTEGER_OPTIONS.has(key) ? parseInteger(argument, value) : value;
  }

  return options;
}

export async function runCli(argv, { signal } = {}) {
  const options = parseArgs(argv);
  if (options.help) return { help: true };
  if (options.version) return { version: VERSION };
  if (options.command === 'doctor') {
    return {
      doctor: await doctor({
        signal,
        agentBrowserCommand: options.browserCommand,
        bskCommand: options.bskCommand,
        apiKeyEnv: options.apiKeyEnv,
      }),
    };
  }
  if (options.command === 'skill') {
    if (options.skillAction === 'path') {
      return {
        skill: {
          action: 'path',
          source: skillSourcePath(),
        },
      };
    }
    return {
      skill: {
        action: 'install',
        ...await installBrowsemuxSkill({
          harnesses: options.harness,
          scope: options.skillScope,
          force: options.force,
        }),
      },
    };
  }
  validateOptions(options);

  const inputs = normalizeInputs(parseJsonOption(options.inputsJson, '--inputs-json'));
  const headers = parseJsonOption(options.headersJson, '--headers-json') ?? {};
  const providerRouting = parseJsonOption(
    options.providerRoutingJson,
    '--provider-routing-json',
  );
  const apiKeyEnv = options.apiKeyEnv ?? defaultApiKeyEnv(options.provider);
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) {
    throw new BrowsemuxError(`Environment variable ${apiKeyEnv} is not set`, {
      code: 'MISSING_API_KEY',
    });
  }

  const browser = createBackend(options.backend, {
    ...backendOptions(options),
    env: browserEnvironment(process.env, apiKeyEnv),
  });
  const provider = createDecisionProvider(options.provider, {
    endpoint: options.endpoint,
    apiKey,
    model: options.model,
    headers,
    provider: providerRouting,
    maxSnapshotChars: options.maxSnapshotChars,
    maxCandidates: options.maxCandidates,
    timeoutMs: options.decisionTimeoutMs,
    structuredOutput: options.structuredOutput,
  });

  const onEvent = options.jsonl
    ? (event) => process.stdout.write(`${JSON.stringify(event)}\n`)
    : undefined;
  let initialObservation;
  let result;

  try {
    initialObservation = options.attach
      ? await browser.attach({ signal })
      : await browser.open(options.url, { signal });
    emit(onEvent, {
      type: 'start',
      backend: options.backend,
      provider: options.provider,
      model: provider.model ?? options.model,
      url: initialObservation.url,
      maxSteps: options.maxSteps,
    });
    result = await runLoop({
      goal: options.goal,
      browser,
      provider,
      inputs,
      maxSteps: options.maxSteps,
      maxRecoveryAttempts: options.maxRecoveryAttempts,
      repeatLimit: options.repeatLimit,
      historyLimit: options.historyLimit,
      successCriteria: {
        urlContains: options.successUrlContains,
        textContains: options.successTextContains,
      },
      initialObservation,
      onEvent,
      signal,
    });
    return { result, options };
  } finally {
    if (!options.keepOpen) {
      try {
        await browser.close();
      } catch (error) {
        process.stderr.write(`browsemux: browser cleanup failed: ${error.message}\n`);
      }
    }
  }
}

export function helpText() {
  return `browsemux: bounded browser decisions with typed, validated actions

Usage:
  browsemux run --backend <name> --provider <name> --url <url> --goal <text> [options]
  browsemux run --backend bsk --attach --bsk-scope <scope> --goal <text> [options]
  browsemux doctor [--json]
  browsemux skill install [--harness <names>] [--scope user|project] [--force]
  browsemux skill path

Backends:
  agent-browser               agent-browser CLI session
  bsk                         Tencent BrowserSkill Agent Window

Decision providers:
  typesafe                    TypeSafe System One / JEV
  openrouter                  OpenRouter Decisions API
  openai                      OpenAI-compatible chat completions

Core options:
  --backend <name>            Browser backend (default: agent-browser)
  --provider <name>           Decision provider (default: typesafe)
  --url <url>                 Start URL; omit with --attach for BSK
  --goal <text>               Bounded browser goal
  --max-steps <n>             Decision iterations (default: 12)
  --max-recovery <n>          Allowed rejected proposals (default: 2)
  --repeat-limit <n>          Repeated semantic action threshold (default: 2)
  --history-limit <n>         Recent actions sent to providers (default: 6)
  --max-candidates <n>        Maximum page refs sent to providers (default: 180)
  --max-observation-chars <n> Snapshot character budget (default: 18000)
  --decision-timeout <ms>     Decision request timeout (default: 30000)
  --settle-timeout <ms>       Backend observation settle budget (default: 6000)
  --inputs-json <json>        Parent-supplied input values; never generated by JEV
  --success-url-contains <s>  Deterministic URL success check
  --success-text-contains <s> Deterministic visible-text success check
  --jsonl                     Stream JSON events followed by the final result
  --keep-open                 Leave the browser session open for handoff

Provider options:
  --model <name>              Provider model slug
  --endpoint <url>            Override the provider endpoint
  --api-key-env <name>        Environment variable containing the API key
  --headers-json <json>       Additional provider request headers
  --provider-routing-json <j> Optional OpenRouter provider routing object
  --structured-output <mode>  json_object, json_schema, or none

agent-browser options:
  --browser-command <path>    Override the agent-browser executable
  --browser-session <name>    Override the agent-browser session name

BSK options:
  --attach                    Attach to an existing Agent Window
  --bsk-command <path>        Override the BSK executable
  --bsk-scope <name>          BSK caller scope
  --bsk-session <id>          Existing BSK session ID
  --bsk-max-tokens <n>        BSK observation token budget (default: 4000)

Harness skill options:
  --harness <names>           all or codex,agents,claude,cursor,opencode,hermes
  --scope <name>              user (default) or project
  --force                     Replace an existing Browsemux skill copy

Examples:
  browsemux run --url https://example.com --goal "Open the documentation" --max-steps 8
  browsemux run --provider openrouter --model typesafe/jev-1.14 --url https://example.com --goal "Find pricing"
  browsemux run --backend bsk --attach --bsk-scope my-agent --goal "Find the latest invoice"
  browsemux skill install --harness codex,claude,cursor,opencode,hermes
`;
}

export async function doctor({
  signal,
  agentBrowserCommand,
  bskCommand,
  apiKeyEnv,
  env = process.env,
  runProcessImpl = runProcess,
} = {}) {
  const agentBrowserInvocation = resolveAgentBrowserInvocation(
    agentBrowserCommand ?? env.BROWSEMUX_AGENT_BROWSER_COMMAND,
  );
  const resolvedBskCommand = bskCommand ?? env.BSK_COMMAND ?? 'bsk';
  const [agentBrowser, bsk] = await Promise.all([
    commandVersion(agentBrowserInvocation, { signal, runProcessImpl }),
    commandVersion(resolvedBskCommand, { signal, runProcessImpl }),
  ]);
  const apiKeyNames = new Set([
    'TYPESAFE_API_KEY',
    'OPENROUTER_API_KEY',
    'OPENAI_API_KEY',
    apiKeyEnv,
  ].filter(Boolean));
  const environment = Object.fromEntries(
    [...apiKeyNames].map((name) => [name, Boolean(env[name])]),
  );
  environment.BSK_COMMAND = env.BSK_COMMAND ? 'set' : 'unset';
  const issues = [];
  const nextSteps = [];
  if (!agentBrowser.installed && !bsk.installed) {
    issues.push('No supported browser backend is installed.');
    nextSteps.push(
      'Install one backend: npm install -g agent-browser then agent-browser install, ' +
        'or install Tencent BrowserSkill for BSK.',
    );
  }
  if (![...apiKeyNames].some((name) => env[name])) {
    issues.push('No supported decision-provider API key is set.');
    nextSteps.push(
      `Set a provider key in your shell: ${[...apiKeyNames].join(', ')}.`,
    );
  }
  return {
    node: process.version,
    ready: issues.length === 0,
    issues,
    nextSteps,
    commands: {
      agentBrowser,
      bsk,
    },
    environment,
  };
}

async function commandVersion(invocation, {
  signal,
  runProcessImpl,
} = {}) {
  const command = typeof invocation === 'string' ? invocation : invocation.command;
  const prefix = typeof invocation === 'string' ? [] : invocation.prefix;
  try {
    const result = await runProcessImpl(command, [...prefix, '--version'], {
      signal,
      timeoutMs: 5_000,
    });
    return {
      installed: true,
      version: (result.stdout || result.stderr).trim(),
    };
  } catch (error) {
    return {
      installed: false,
      error: errorResult(error),
    };
  }
}

function backendOptions(options) {
  if (options.backend === 'bsk') {
    return {
      command: options.bskCommand,
      bskCommand: options.bskCommand,
      scope: options.bskScope,
      sessionId: options.bskSession,
      maxObservationTokens: options.bskMaxTokens,
      settleTimeoutMs: options.settleTimeoutMs,
    };
  }
  return {
    command: options.browserCommand,
    session: options.browserSession,
    settleTimeoutMs: Math.min(options.settleTimeoutMs, 5_000),
  };
}

function validateOptions(options) {
  if (!SUPPORTED_BACKENDS.has(options.backend)) {
    throw new BrowsemuxError(`Unsupported backend: ${options.backend}`, {
      code: 'INVALID_ARGUMENTS',
    });
  }
  if (!SUPPORTED_PROVIDERS.has(options.provider)) {
    throw new BrowsemuxError(`Unsupported provider: ${options.provider}`, {
      code: 'INVALID_ARGUMENTS',
    });
  }
  if (!options.goal?.trim()) {
    throw new BrowsemuxError('--goal is required', { code: 'INVALID_ARGUMENTS' });
  }
  if (!options.url && !options.attach) {
    throw new BrowsemuxError('--url or --attach is required', { code: 'INVALID_ARGUMENTS' });
  }
  if (options.attach && options.backend !== 'bsk') {
    throw new BrowsemuxError('--attach is currently supported only by BSK', {
      code: 'INVALID_ARGUMENTS',
    });
  }
  if (options.attach && !options.bskScope && !options.bskSession) {
    throw new BrowsemuxError('--attach requires --bsk-scope or --bsk-session', {
      code: 'INVALID_ARGUMENTS',
    });
  }
}

function defaultApiKeyEnv(provider) {
  if (provider === 'typesafe') return 'TYPESAFE_API_KEY';
  if (provider === 'openrouter') return 'OPENROUTER_API_KEY';
  return 'OPENAI_API_KEY';
}

export function browserEnvironment(env, apiKeyEnv) {
  const sanitized = { ...env };
  for (const name of [
    'TYPESAFE_API_KEY',
    'OPENROUTER_API_KEY',
    'OPENAI_API_KEY',
    apiKeyEnv,
  ]) {
    if (name) delete sanitized[name];
  }
  return sanitized;
}

function parseInteger(name, value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new BrowsemuxError(`${name} must be a non-negative integer`, {
      code: 'INVALID_ARGUMENTS',
    });
  }
  return number;
}

function emit(onEvent, event) {
  if (onEvent) onEvent(event);
}

export function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]).toLowerCase()
      === realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
  } catch {
    return false;
  }
}
