import { BrowsemuxError } from '../errors.mjs';
import { parseJsonOutput } from '../util/json.mjs';
import { runProcess } from '../util/process.mjs';
import { sleep } from '../util/time.mjs';
import { validateHttpUrl } from '../util/url.mjs';

export class BskCli {
  constructor({
    command = process.env.BSK_COMMAND ?? 'bsk',
    defaultTimeoutMs = 45_000,
  } = {}) {
    if (!command || typeof command !== 'string') {
      throw new BrowsemuxError('BSK command must be a non-empty string', {
        code: 'INVALID_BACKEND_CONFIG',
      });
    }
    this.command = command;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  async run(args, { signal, timeoutMs = this.defaultTimeoutMs } = {}) {
    const result = await runProcess(this.command, args, { signal, timeoutMs });
    return parseJsonOutput(result.stdout);
  }
}

export class BskBackend {
  constructor({
    cli = new BskCli(),
    scope = defaultScope(),
    sessionId,
    tabId,
    maxObservationTokens = 4_000,
    settleTimeoutMs = 6_000,
    settlePollMs = 250,
    now = Date.now,
    sleepImpl = sleep,
  } = {}) {
    if (!cli || typeof cli.run !== 'function') {
      throw new BrowsemuxError('BSK CLI must expose run(args, options)', {
        code: 'INVALID_BACKEND_CONFIG',
      });
    }
    this.name = 'bsk';
    this.cli = cli;
    this.scope = String(scope);
    this.sessionId = sessionId ? String(sessionId) : null;
    this.tabId = tabId === undefined || tabId === null ? null : Number(tabId);
    this.maxObservationTokens = maxObservationTokens;
    this.settleTimeoutMs = settleTimeoutMs;
    this.settlePollMs = settlePollMs;
    this.now = now;
    this.sleep = sleepImpl;
    this.cachedObservation = null;
    this.lastObservation = null;
    this.lastUrl = '';
    this.opened = false;
  }

  async open(url, { signal } = {}) {
    const destination = validateHttpUrl(url);
    const payload = await this.cli.run([
      'open',
      destination,
      ...this.sessionArgs(),
      '--json',
      '--no-focus',
      '--max-tokens',
      String(this.maxObservationTokens),
      '--timeout-ms',
      String(this.settleTimeoutMs),
    ], { signal });

    const sessionId = payload.session_id ?? payload.sessionId;
    if (!sessionId) {
      throw new BrowsemuxError('BSK open did not return a session ID', {
        code: 'MISSING_SESSION',
      });
    }
    this.sessionId = String(sessionId);
    if (payload.tab_id !== undefined) this.tabId = Number(payload.tab_id);
    this.lastUrl = String(payload.url ?? destination);
    this.opened = true;

    const snapshot = String(payload.vom ?? payload.text ?? '');
    if (!snapshot.trim()) return this.snapshot({ signal });
    const observation = normalizeObservation({
      url: this.lastUrl,
      title: payload.title,
      snapshot,
      tabId: this.tabId,
    });
    this.cachedObservation = observation;
    this.lastObservation = observation;
    return observation;
  }

  async attach({ signal } = {}) {
    this.opened = true;
    return this.snapshot({ signal });
  }

  async snapshot({ signal } = {}) {
    if (this.cachedObservation) {
      const observation = this.cachedObservation;
      this.cachedObservation = null;
      this.lastObservation = observation;
      return observation;
    }
    const deadline = this.now() + this.settleTimeoutMs;
    let lastError;
    while (this.now() < deadline) {
      try {
        const payload = await this.cli.run([
          'snapshot',
          ...this.sessionArgs(),
          ...this.tabArgs(),
          '--json',
          '--max-tokens',
          String(this.maxObservationTokens),
        ], { signal, timeoutMs: remaining(this.now, deadline) });
        const text = String(payload.text ?? payload.vom ?? '');
        if (text.trim()) {
          const tab = await this.readTab({ signal, deadline });
          const observation = normalizeObservation({
            url: tab.url || this.lastUrl,
            title: tab.title,
            snapshot: text,
            tabId: payload.tab_id ?? tab.tab_id ?? this.tabId,
          });
          this.remember(observation);
          return observation;
        }
      } catch (error) {
        if (isAbort(error, signal)) throw error;
        lastError = error;
      }
      const delay = Math.min(this.settlePollMs, Math.max(0, deadline - this.now()));
      if (delay > 0) await this.sleep(delay);
    }
    throw new BrowsemuxError('BSK did not produce a usable snapshot', {
      code: 'SNAPSHOT_EMPTY',
      cause: lastError,
    });
  }

  async action(operation, {
    target,
    value,
    signal,
  } = {}) {
    if (isTargeted(operation) && (!target || !this.lastObservation?.refs?.[target])) {
      throw new BrowsemuxError(`Target ${target ?? '(missing)'} is not in the latest BSK snapshot`, {
        code: 'STALE_TARGET',
      });
    }
    const command = this.actionCommand(operation, { target, value });
    await this.cli.run(command, { signal, timeoutMs: 35_000 });
    const observation = await this.settleAfterAction({ signal });
    this.cachedObservation = observation;
    return {
      dispatched: true,
      effect: 'settled',
      settledUrl: observation.url,
    };
  }

  async close({ signal } = {}) {
    if (!this.opened && !this.sessionId) return { closed: true, alreadyClosed: true };
    try {
      return await this.cli.run(['close', ...this.sessionArgs(), '--json'], {
        signal,
        timeoutMs: 15_000,
      });
    } finally {
      this.opened = false;
      this.sessionId = null;
      this.lastObservation = null;
      this.cachedObservation = null;
      this.lastUrl = '';
    }
  }

  actionCommand(operation, { target, value } = {}) {
    const common = [...this.sessionArgs(), '--json'];
    switch (operation) {
      case 'CLICK':
        return ['click', '--ref', target, ...common];
      case 'TYPE':
        return ['fill', '--ref', target, '--value', value, ...common];
      case 'SELECT':
        return ['select', '--ref', target, '--value', value, ...common];
      case 'PRESS':
        return ['press', value, ...common];
      case 'SCROLL_UP':
        return ['wheel', '--delta-y', '-600', ...common];
      case 'SCROLL_DOWN':
        return ['wheel', '--delta-y', '600', ...common];
      case 'BACK':
        return ['navigate-back', ...common];
      case 'WAIT':
        return ['wait-ms', '500', ...common];
      case 'NAVIGATE':
        return ['navigate', validateHttpUrl(value), ...common];
      default:
        throw new BrowsemuxError(`Unsupported BSK operation: ${operation}`, {
          code: 'UNSUPPORTED_OPERATION',
        });
    }
  }

  async settleAfterAction({ signal } = {}) {
    const deadline = this.now() + this.settleTimeoutMs;
    let lastError;
    while (this.now() < deadline) {
      try {
        const payload = await this.cli.run([
          'sync',
          ...this.sessionArgs(),
          ...this.tabArgs(),
          '--json',
          '--max-tokens',
          String(this.maxObservationTokens),
          '--timeout-ms',
          String(remaining(this.now, deadline)),
        ], { signal, timeoutMs: remaining(this.now, deadline) + 2_000 });
        const text = String(payload.vom ?? payload.text ?? '');
        if (text.trim()) {
          const tab = await this.readTab({ signal, deadline });
          const observation = normalizeObservation({
            url: tab.url || payload.url || this.lastUrl,
            title: tab.title,
            snapshot: text,
            tabId: payload.tab_id ?? tab.tab_id ?? this.tabId,
          });
          this.remember(observation);
          return observation;
        }
      } catch (error) {
        if (isAbort(error, signal)) throw error;
        lastError = error;
      }
      const delay = Math.min(this.settlePollMs, Math.max(0, deadline - this.now()));
      if (delay > 0) await this.sleep(delay);
    }
    const error = new BrowsemuxError(
      `BSK action completed but the page did not settle within ${this.settleTimeoutMs}ms`,
      { code: 'EFFECT_UNKNOWN', cause: lastError },
    );
    error.effectState = 'unknown';
    throw error;
  }

  async readTab({ signal, deadline }) {
    const payload = await this.cli.run([
      'tab',
      'list',
      ...this.sessionArgs(),
      '--scope',
      'agent',
      '--json',
    ], { signal, timeoutMs: remaining(this.now, deadline) });
    const tabs = Array.isArray(payload.tabs) ? payload.tabs : [];
    if (!tabs.length) {
      throw new BrowsemuxError('BSK returned no Agent Window tabs', { code: 'TAB_NOT_FOUND' });
    }
    const tab = tabs.find((item) => Number(item.tab_id) === Number(this.tabId))
      ?? tabs.find((item) => item.active)
      ?? tabs[0];
    if (!tab.url) throw new BrowsemuxError('BSK tab URL is not ready', { code: 'URL_NOT_READY' });
    this.tabId = Number(tab.tab_id ?? this.tabId);
    return tab;
  }

  sessionArgs() {
    return this.sessionId ? ['--session', this.sessionId] : ['--scope', this.scope];
  }

  tabArgs() {
    return this.tabId === null ? [] : ['--tab-id', String(this.tabId)];
  }

  remember(observation) {
    if (observation.url) this.lastUrl = observation.url;
    this.lastObservation = observation;
  }
}

export function normalizeObservation({ url = '', title = '', snapshot = '', tabId = null }) {
  const text = String(snapshot ?? '');
  if (!text.trim()) {
    throw new BrowsemuxError('BSK snapshot must not be empty', { code: 'INVALID_SNAPSHOT' });
  }
  return {
    backend: 'bsk',
    url: String(url ?? ''),
    title: String(title ?? ''),
    snapshot: text,
    refs: parseBskRefs(text),
    metadata: { tabId },
  };
}

export function parseBskRefs(snapshot) {
  const refs = {};
  for (const line of String(snapshot ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*(@e\d+)\s+([^\s"]+)(?:\s+"((?:\\.|[^"\\])*)")?/);
    if (!match) continue;
    const [, ref, rawRole, rawName = ''] = match;
    let name = rawName;
    if (rawName) {
      try {
        name = JSON.parse(`"${rawName}"`);
      } catch {
        name = rawName.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
    }
    refs[ref] = {
      role: rawRole.toLowerCase(),
      name,
    };
  }
  return refs;
}

export function defaultScope() {
  return `browsemux-${process.pid}-${Date.now().toString(36)}`;
}

function isTargeted(operation) {
  return ['CLICK', 'TYPE', 'SELECT'].includes(operation);
}

function remaining(now, deadline) {
  return Math.max(1, Math.min(30_000, Math.floor(deadline - now())));
}

function isAbort(error, signal) {
  return signal?.aborted || error?.code === 'ABORT_ERR' || error?.name === 'AbortError';
}

