import { BrowsemuxError } from '../errors.mjs';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseJsonOutput } from '../util/json.mjs';
import { runProcess } from '../util/process.mjs';
import { sleep } from '../util/time.mjs';
import { validateHttpUrl } from '../util/url.mjs';

const EMPTY_PAGE_PATTERN = /\(empty page\)/i;
const require = createRequire(import.meta.url);

export class AgentBrowserBackend {
  constructor({
    command = process.env.BROWSEMUX_AGENT_BROWSER_COMMAND,
    session = defaultSession(),
    timeoutMs = 30_000,
    settleTimeoutMs = 2_000,
    settlePollMs = 100,
    sleepImpl = sleep,
  } = {}) {
    if (!Number.isInteger(settleTimeoutMs) || settleTimeoutMs < 0) {
      throw new BrowsemuxError('settleTimeoutMs must be a non-negative integer', {
        code: 'INVALID_BACKEND_CONFIG',
      });
    }
    if (!Number.isInteger(settlePollMs) || settlePollMs < 0) {
      throw new BrowsemuxError('settlePollMs must be a non-negative integer', {
        code: 'INVALID_BACKEND_CONFIG',
      });
    }
    this.name = 'agent-browser';
    const invocation = resolveAgentBrowserInvocation(command);
    this.command = invocation.command;
    this.commandPrefix = invocation.prefix;
    this.session = session;
    this.timeoutMs = timeoutMs;
    this.settleTimeoutMs = settleTimeoutMs;
    this.settlePollMs = settlePollMs;
    this.sleep = sleepImpl;
    this.lastObservation = null;
    this.opened = false;
  }

  async open(url, { signal } = {}) {
    const destination = validateHttpUrl(url);
    await this.run(['open', destination], { signal });
    this.opened = true;
    this.lastObservation = null;
    return this.snapshot({ signal });
  }

  async attach({ signal } = {}) {
    this.opened = true;
    return this.snapshot({ signal });
  }

  async snapshot({ signal } = {}) {
    const deadline = Date.now() + this.settleTimeoutMs;
    let lastError;
    while (true) {
      try {
        const result = await this.run(['snapshot', '--json'], { signal });
        const observation = normalizeSnapshot(parseJsonOutput(result.stdout));
        const empty = Object.keys(observation.refs).length === 0
          && EMPTY_PAGE_PATTERN.test(observation.snapshot);
        if (!empty) {
          this.lastObservation = observation;
          return observation;
        }
        lastError = new BrowsemuxError('agent-browser returned an empty page snapshot', {
          code: 'SNAPSHOT_EMPTY',
        });
      } catch (error) {
        if (isAbort(error, signal)) throw error;
        lastError = error;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new BrowsemuxError(
          `agent-browser did not produce a usable snapshot within ${this.settleTimeoutMs}ms`,
          { code: 'SNAPSHOT_EMPTY', cause: lastError },
        );
      }
      await this.sleep(Math.min(this.settlePollMs, remaining));
    }
  }

  async action(operation, {
    target,
    value,
    signal,
  } = {}) {
    if (isTargeted(operation)) {
      if (!target || !this.lastObservation?.refs?.[target]) {
        throw new BrowsemuxError(`Target ${target ?? '(missing)'} is not in the latest snapshot`, {
          code: 'STALE_TARGET',
        });
      }
    }

    const args = actionArgs(operation, { target, value });
    await this.run(args, { signal });
    return { dispatched: true, effect: 'observed-next' };
  }

  async close({ signal } = {}) {
    if (!this.opened) return { closed: true, alreadyClosed: true };
    try {
      await this.run(['close'], { signal, timeoutMs: 15_000 });
      return { closed: true };
    } finally {
      this.opened = false;
      this.lastObservation = null;
    }
  }

  async run(args, { signal, timeoutMs = this.timeoutMs } = {}) {
    const result = await runProcess(
      this.command,
      [...this.commandPrefix, '--session', this.session, ...args],
      { signal, timeoutMs },
    );
    return result;
  }
}

export function resolveAgentBrowserInvocation(command) {
  if (command) {
    if (/\.(?:c|m)?js$/i.test(command)) {
      return { command: process.execPath, prefix: [command] };
    }
    return { command, prefix: [] };
  }

  try {
    const entry = require.resolve('agent-browser/bin/agent-browser.js');
    return { command: process.execPath, prefix: [entry] };
  } catch {
    // Fall through to common global package locations.
  }

  for (const root of globalNodeModuleRoots()) {
    const entry = join(root, 'agent-browser', 'bin', 'agent-browser.js');
    if (existsSync(entry)) {
      return { command: process.execPath, prefix: [entry] };
    }
  }
  return { command: 'agent-browser', prefix: [] };
}

function globalNodeModuleRoots() {
  const roots = [];
  if (process.platform === 'win32' && process.env.APPDATA) {
    roots.push(join(process.env.APPDATA, 'npm', 'node_modules'));
  }
  if (process.env.NODE_PATH) {
    roots.push(...process.env.NODE_PATH.split(process.platform === 'win32' ? ';' : ':').filter(Boolean));
  }
  return roots;
}

export function normalizeSnapshot(payload) {
  const data = payload?.data ?? payload;
  const snapshot = data?.snapshot;
  const rawRefs = data?.refs;
  if (typeof snapshot !== 'string' || !rawRefs || typeof rawRefs !== 'object' || Array.isArray(rawRefs)) {
    throw new BrowsemuxError('agent-browser snapshot is missing data.snapshot or data.refs', {
      code: 'INVALID_SNAPSHOT',
    });
  }
  const refs = Object.fromEntries(
    Object.entries(rawRefs)
      .sort(([left], [right]) => refNumber(left) - refNumber(right))
      .map(([rawRef, rawDetails]) => {
        const ref = rawRef.startsWith('@') ? rawRef : `@${rawRef}`;
        const details = rawDetails && typeof rawDetails === 'object'
          ? rawDetails
          : { name: rawDetails };
        return [ref, {
          role: String(details.role ?? '').toLowerCase(),
          name: String(details.name ?? ''),
        }];
      }),
  );
  return {
    backend: 'agent-browser',
    url: String(data.url ?? data.origin ?? ''),
    title: String(data.title ?? ''),
    snapshot,
    refs,
    metadata: {},
  };
}

export function defaultSession() {
  return `browsemux-${process.pid}-${Date.now().toString(36)}`;
}

function actionArgs(operation, { target, value }) {
  switch (operation) {
    case 'CLICK':
      return ['click', target];
    case 'TYPE':
      return ['fill', target, value];
    case 'SELECT':
      return ['select', target, value];
    case 'PRESS':
      return ['press', value];
    case 'SCROLL_UP':
      return ['scroll', 'up'];
    case 'SCROLL_DOWN':
      return ['scroll', 'down'];
    case 'BACK':
      return ['back'];
    case 'WAIT':
      return ['wait', '500'];
    case 'NAVIGATE':
      return ['open', validateHttpUrl(value)];
    default:
      throw new BrowsemuxError(`Unsupported agent-browser operation: ${operation}`, {
        code: 'UNSUPPORTED_OPERATION',
      });
  }
}

function isTargeted(operation) {
  return ['CLICK', 'TYPE', 'SELECT'].includes(operation);
}

function refNumber(value) {
  const match = String(value).match(/(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function isAbort(error, signal) {
  return signal?.aborted || error?.code === 'ABORT_ERR' || error?.name === 'AbortError';
}
