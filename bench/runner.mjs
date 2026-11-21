import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackend } from '../src/backends/index.mjs';
import { deterministicSuccess } from '../src/contracts.mjs';
import { createDecisionProvider } from '../src/decisions/index.mjs';
import { normalizeInputs } from '../src/inputs.mjs';
import { runLoop } from '../src/loop.mjs';
import { elapsed, nowMs } from '../src/util/time.mjs';
import { DirectChatModel, runDirectHarness } from './direct-harness.mjs';
import { startFixtureServer } from './fixture-server.mjs';
import { formatMarkdown, summarizeBenchmark } from './report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TASKS = join(HERE, 'tasks.json');
const DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek/deepseek-chat';

export async function runBenchmark(options) {
  const apiKey = process.env[options.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Environment variable ${options.apiKeyEnv} is not set`);
  }

  const tasks = await loadTasks(options.taskFile);
  const selectedTasks = selectTasks(tasks, options.tasks);
  const fixture = await startFixtureServer();
  const startedAt = new Date().toISOString();
  const runs = [];
  let runIndex = 0;

  try {
    if (options.warmup > 0) {
      for (let index = 0; index < options.warmup; index += 1) {
        for (const backendName of options.backends) {
          for (const arm of options.arms) {
            const task = selectedTasks[index % selectedTasks.length];
            runIndex += 1;
            await runOne({
              task,
              baseUrl: fixture.baseUrl,
              backendName,
              arm,
              repeat: -1,
              runIndex,
              options,
              apiKey,
            });
          }
        }
      }
    }

    for (let repeat = 0; repeat < options.repeats; repeat += 1) {
      for (const task of selectedTasks) {
        for (const backendName of options.backends) {
          const arms = repeat % 2 === 0 ? options.arms : [...options.arms].reverse();
          for (const arm of arms) {
            runIndex += 1;
            const record = await runOne({
              task,
              baseUrl: fixture.baseUrl,
              backendName,
              arm,
              repeat: repeat + 1,
              runIndex,
              options,
              apiKey,
            });
            runs.push(record);
            process.stderr.write([
              `[${runs.length}]`,
              task.id,
              backendName,
              arm,
              record.status,
              `${Math.round(record.wallMs.total)}ms`,
              `${record.modelCalls} calls`,
              `${record.browserCommands} commands`,
              '',
            ].join(' '));
          }
        }
      }
    }
  } finally {
    await fixture.close();
  }

  const metadata = {
    startedAt,
    finishedAt: new Date().toISOString(),
    model: options.model,
    endpoint: options.endpoint,
    tasks: selectedTasks.map((task) => task.id),
    repeats: options.repeats,
    maxSnapshotChars: options.maxSnapshotChars,
    maxSteps: options.maxSteps,
    backends: options.backends,
    arms: options.arms,
    directMode: 'cumulative-harness-conversation',
    runtime: {
      node: process.version,
      platform: process.platform,
    },
  };
  const report = summarizeBenchmark(runs);
  const markdown = formatMarkdown(report, metadata);

  if (!options.noWrite) {
    await mkdir(options.outputDir, { recursive: true });
    await writeFile(
      join(options.outputDir, 'runs.json'),
      `${JSON.stringify({ metadata, runs }, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      join(options.outputDir, 'summary.json'),
      `${JSON.stringify({ metadata, report }, null, 2)}\n`,
      'utf8',
    );
    await writeFile(join(options.outputDir, 'summary.md'), markdown, 'utf8');
  }

  return { metadata, report, markdown };
}

async function runOne({
  task,
  baseUrl,
  backendName,
  arm,
  repeat,
  runIndex,
  options,
  apiKey,
}) {
  const inputs = normalizeInputs(task.inputs);
  const maxSteps = options.maxSteps ?? task.maxSteps ?? 5;
  const successCriteria = task.success ?? {};
  const startUrl = task.startUrl ?? new URL(task.startPath, baseUrl).toString();
  const backend = createBenchmarkBackend({
    backendName,
    runIndex,
    options,
  });
  const counts = instrumentBackend(backend);
  const events = [];
  const onEvent = (event) => {
    if (!['decision', 'validation'].includes(event.type)) return;
    events.push(event);
  };

  const openStarted = nowMs();
  let openMs = 0;
  let output;
  let error;
  let retryingProvider;
  try {
    const initialObservation = await backend.open(startUrl);
    openMs = elapsed(openStarted);
    const armStarted = nowMs();
    if (arm === 'direct') {
      const provider = new DirectChatModel({
        endpoint: options.endpoint,
        apiKey,
        model: options.model,
        headers: options.headers,
        timeoutMs: options.decisionTimeoutMs,
      });
      retryingProvider = withModelRetries(provider, {
        maxRetries: options.modelRetries,
      });
      output = await runDirectHarness({
        goal: task.goal,
        browser: backend,
        provider: retryingProvider,
        inputs,
        maxSteps,
        maxSnapshotChars: options.maxSnapshotChars,
        successCriteria,
        initialObservation,
        onEvent,
        signal: options.signal,
      });
    } else {
      const provider = createDecisionProvider('openai', {
        endpoint: options.endpoint,
        apiKey,
        model: options.model,
        headers: options.headers,
        provider: options.providerRouting,
        maxSnapshotChars: options.maxSnapshotChars,
        timeoutMs: options.decisionTimeoutMs,
        structuredOutput: 'json_object',
      });
      retryingProvider = withModelRetries(provider, {
        maxRetries: options.modelRetries,
      });
      output = await runLoop({
        goal: task.goal,
        browser: backend,
        provider: retryingProvider,
        inputs,
        maxSteps,
        successCriteria,
        initialObservation,
        onEvent,
        signal: options.signal,
      });
    }
    output.armWallMs = elapsed(armStarted);
  } catch (caught) {
    openMs = elapsed(openStarted);
    error = caught;
    output = {
      status: 'error',
      reasonCode: caught?.code ?? 'BENCHMARK_ERROR',
      reason: caught?.message ?? String(caught),
      timings: { decisionMs: 0, observationMs: 0, actionMs: 0 },
      usage: {},
      actionCount: 0,
      observation: null,
      durationMs: elapsed(openStarted),
    };
  }

  let closeError;
  const closeStarted = nowMs();
  try {
    await backend.close();
  } catch (caught) {
    closeError = caught;
  }
  const closeMs = elapsed(closeStarted);
  const totalWallMs = elapsed(openStarted);
  const modelCalls = arm === 'direct'
    ? Number(output.modelCalls) || 0
    : events.filter((event) => event.type === 'decision').length;
  const invalidActions = events.filter((event) =>
    event.type === 'validation' && event.accepted === false).length;

  return {
    id: `${repeat}:${task.id}:${backendName}:${arm}:${runIndex}`,
    taskId: task.id,
    goal: task.goal,
    repeat,
    backend: backendName,
    arm,
    model: options.model,
    status: output.status,
    reasonCode: output.reasonCode,
    reason: output.reason,
    success: output.status === 'success'
      && deterministicSuccess(output.observation, successCriteria),
    wallMs: {
      total: totalWallMs,
      open: openMs,
      arm: Number(output.armWallMs) || Number(output.durationMs) || 0,
      close: closeMs,
    },
    timings: output.timings ?? { decisionMs: 0, observationMs: 0, actionMs: 0 },
    usage: output.usage ?? {},
    modelCalls,
    modelRetries: retryingProvider?.retries?.count ?? 0,
    actions: Number(output.actionCount) || 0,
    invalidActions,
    browserCommands: counts.commands,
    observationChars: Number(output.requestChars) || 0,
    finalUrl: output.observation?.url ?? '',
    finalTitle: output.observation?.title ?? '',
    error: error ? {
      code: error.code ?? 'BENCHMARK_ERROR',
      message: error.message,
    } : closeError ? {
      code: closeError.code ?? 'CLOSE_ERROR',
      message: closeError.message,
    } : null,
    events,
  };
}

export function withModelRetries(provider, {
  maxRetries = 2,
  sleepImpl = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
} = {}) {
  const retries = { count: 0 };
  return {
    name: provider.name,
    model: provider.model,
    retries,
    async decide(args) {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await provider.decide(args);
        } catch (error) {
          if (attempt >= maxRetries || !isTransientModelError(error)) throw error;
          retries.count += 1;
          await sleepImpl(Math.min(2_000, 250 * (2 ** attempt)));
        }
      }
    },
  };
}

function createBenchmarkBackend({ backendName, runIndex, options }) {
  const suffix = `${process.pid}-${Date.now().toString(36)}-${runIndex}`;
  if (backendName === 'bsk') {
    return createBackend('bsk', {
      command: options.bskCommand,
      bskCommand: options.bskCommand,
      scope: `browsemux-bench-${suffix}`,
      settleTimeoutMs: options.settleTimeoutMs,
    });
  }
  return createBackend('agent-browser', {
    command: options.browserCommand,
    session: `browsemux-bench-${suffix}`,
    settleTimeoutMs: Math.min(options.settleTimeoutMs, 5_000),
  });
}

function instrumentBackend(backend) {
  const counts = { commands: 0 };
  if (backend.name === 'agent-browser' && typeof backend.run === 'function') {
    wrapMethod(backend, 'run', counts);
  }
  if (backend.name === 'bsk' && backend.cli) {
    wrapMethod(backend.cli, 'run', counts);
    wrapMethod(backend.cli, 'runAllowFailure', counts);
  }
  return counts;
}

function wrapMethod(object, methodName, counts) {
  const original = object[methodName];
  if (typeof original !== 'function') return;
  object[methodName] = async function instrumented(...args) {
    counts.commands += 1;
    return original.apply(this, args);
  };
}

async function loadTasks(taskFile) {
  const raw = await readFile(taskFile, 'utf8');
  const tasks = JSON.parse(raw);
  if (!Array.isArray(tasks) || !tasks.length) {
    throw new Error(`Task file must contain a non-empty array: ${taskFile}`);
  }
  for (const task of tasks) {
    if (!task.id || !task.goal || (!task.startPath && !task.startUrl)) {
      throw new Error('Every task requires id, goal, and startPath or startUrl');
    }
  }
  return tasks;
}

function selectTasks(tasks, selection) {
  if (!selection.length) return tasks;
  const wanted = new Set(selection);
  const selected = tasks.filter((task) => wanted.has(task.id));
  const missing = [...wanted].filter((id) => !selected.some((task) => task.id === id));
  if (missing.length) {
    throw new Error(`Unknown benchmark task IDs: ${missing.join(', ')}`);
  }
  return selected;
}

export function parseBenchmarkArgs(argv, { cwd = process.cwd() } = {}) {
  const options = {
    taskFile: DEFAULT_TASKS,
    tasks: [],
    backends: ['agent-browser', 'bsk'],
    arms: ['direct', 'browsemux'],
    repeats: 2,
    warmup: 0,
    model: DEFAULT_MODEL,
    endpoint: DEFAULT_ENDPOINT,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    headers: {},
    providerRouting: undefined,
    maxSnapshotChars: 8_000,
    maxSteps: undefined,
    decisionTimeoutMs: 30_000,
    settleTimeoutMs: 6_000,
    modelRetries: 2,
    browserCommand: undefined,
    bskCommand: undefined,
    outputDir: join(cwd, 'bench', 'results', new Date().toISOString().replaceAll(':', '-')),
    noWrite: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--no-write') {
      options.noWrite = true;
      continue;
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`${argument} requires a value`);
    switch (argument) {
      case '--task-file':
        options.taskFile = resolve(cwd, value);
        break;
      case '--tasks':
        options.tasks = csv(value);
        break;
      case '--backends':
        options.backends = csv(value);
        break;
      case '--arms':
        options.arms = csv(value);
        break;
      case '--repeats':
        options.repeats = positiveInteger(argument, value);
        break;
      case '--warmup':
        options.warmup = nonNegativeInteger(argument, value);
        break;
      case '--model':
        options.model = value;
        break;
      case '--endpoint':
        options.endpoint = value;
        break;
      case '--api-key-env':
        options.apiKeyEnv = value;
        break;
      case '--headers-json':
        options.headers = JSON.parse(value);
        break;
      case '--provider-routing-json':
        options.providerRouting = JSON.parse(value);
        break;
      case '--max-observation-chars':
        options.maxSnapshotChars = positiveInteger(argument, value);
        break;
      case '--max-steps':
        options.maxSteps = positiveInteger(argument, value);
        break;
      case '--decision-timeout':
        options.decisionTimeoutMs = positiveInteger(argument, value);
        break;
      case '--settle-timeout':
        options.settleTimeoutMs = positiveInteger(argument, value);
        break;
      case '--model-retries':
        options.modelRetries = nonNegativeInteger(argument, value);
        break;
      case '--browser-command':
        options.browserCommand = value;
        break;
      case '--bsk-command':
        options.bskCommand = value;
        break;
      case '--output-dir':
        options.outputDir = resolve(cwd, value);
        break;
      default:
        throw new Error(`Unknown benchmark option: ${argument}`);
    }
  }

  for (const backend of options.backends) {
    if (!['agent-browser', 'bsk'].includes(backend)) {
      throw new Error(`Unsupported benchmark backend: ${backend}`);
    }
  }
  for (const arm of options.arms) {
    if (!['direct', 'browsemux'].includes(arm)) {
      throw new Error(`Unsupported benchmark arm: ${arm}`);
    }
  }
  return options;
}

export function benchmarkHelp() {
  return `browsemux benchmark runner

Usage:
  node bench/runner.mjs [options]

Options:
  --task-file <path>             JSON task file (default: bench/tasks.json)
  --tasks <id,id>                Select task IDs
  --backends <name,name>         agent-browser, bsk
  --arms <name,name>             direct, browsemux
  --repeats <n>                  Recorded repeats per task/backend/arm
  --warmup <n>                   Unrecorded warmup rounds
  --model <slug>                 Same OpenAI-compatible model for both arms
  --endpoint <url>               Chat-completions endpoint
  --api-key-env <name>           API key environment variable
  --headers-json <json>          Additional request headers
  --provider-routing-json <json> Optional OpenRouter provider routing
  --max-observation-chars <n>    Snapshot character budget
  --max-steps <n>                Override task maxSteps
  --decision-timeout <ms>        Model request timeout
  --settle-timeout <ms>          Browser settle budget
  --model-retries <n>            Retry transient model transport errors
  --browser-command <path>       Override agent-browser
  --bsk-command <path>           Override BSK
  --output-dir <path>            Results directory
  --no-write                     Do not persist JSON or Markdown
`;
}

function csv(value) {
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function isTransientModelError(error) {
  if (['DECISION_TIMEOUT', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'].includes(error?.code)) {
    return true;
  }
  if (error?.code === 'DECISION_HTTP_ERROR' && Number(error?.details?.status) >= 500) {
    return true;
  }
  return /fetch failed|network|socket hang up|temporar/i.test(String(error?.message ?? ''));
}

function positiveInteger(name, value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return number;
}

function nonNegativeInteger(name, value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return number;
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    const options = parseBenchmarkArgs(process.argv.slice(2), { cwd: process.cwd() });
    if (options.help) {
      process.stdout.write(benchmarkHelp());
    } else {
      options.signal = controller.signal;
      const output = await runBenchmark(options);
      if (!options.noWrite) {
        process.stderr.write(`Results: ${options.outputDir}\n`);
      }
      process.stdout.write(output.markdown);
    }
  } catch (error) {
    process.stderr.write(`benchmark: ${error.message}\n`);
    process.exitCode = error.name === 'AbortError' ? 130 : 1;
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}
