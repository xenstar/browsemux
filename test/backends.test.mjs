import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSnapshot } from '../src/backends/agent-browser.mjs';
import {
  BskBackend,
  BskCli,
  normalizeObservation,
  parseBskRefs,
} from '../src/backends/bsk.mjs';
import { BrowsemuxError } from '../src/errors.mjs';

test('normalizes an agent-browser snapshot', () => {
  const observation = normalizeSnapshot({
    data: {
      url: 'https://example.com/',
      title: 'Example',
      snapshot: '- button "Continue" [ref=e1]',
      refs: {
        e1: { role: 'button', name: 'Continue' },
      },
    },
  });

  assert.equal(observation.url, 'https://example.com/');
  assert.equal(observation.refs['@e1'].role, 'button');
});

test('parses BSK refs and escaped names', () => {
  const refs = parseBskRefs([
    '  @e1 button "Continue"',
    '  @e2 textbox "Search \\"docs\\""',
  ].join('\n'));

  assert.equal(refs['@e1'].name, 'Continue');
  assert.equal(refs['@e2'].name, 'Search "docs"');
});

test('BSK keeps the opened snapshot as the validated action base', async () => {
  const start = [
    '@vom 1',
    '  @e1 button "Continue"',
  ].join('\n');
  const next = [
    '@vom 1',
    '  @e1 button "Finish"',
  ].join('\n');
  const cli = new FakeBskCli((args) => {
    if (args[0] === 'open') {
      return {
        session_id: 'session-1',
        tab_id: 7,
        url: 'https://example.com/',
        vom: start,
      };
    }
    if (args[0] === 'click') return { used_ref: 'e1' };
    if (args[0] === 'sync') return { vom: next, tab_id: 7 };
    if (args[0] === 'tab') {
      return { tabs: [{ tab_id: 7, url: 'https://example.com/next', active: true }] };
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  });
  const browser = new BskBackend({ cli, scope: 'test' });

  const observation = await browser.open('https://example.com');
  assert.equal(observation.refs['@e1'].name, 'Continue');
  await browser.action('CLICK', { target: '@e1' });
});

test('BSK rejects a stale target before dispatch', async () => {
  const browser = new BskBackend({ cli: new FakeBskCli(), scope: 'test' });
  browser.lastObservation = normalizeObservation({
    url: 'https://example.com/',
    snapshot: '@vom 1\n  @e1 button "Continue"',
  });

  await assert.rejects(
    () => browser.action('CLICK', { target: '@e99' }),
    (error) => error.code === 'STALE_TARGET',
  );
});

test('BSK step returns its post-action observation without a sync command', async () => {
  const next = [
    '@vom 1',
    '  @e1 link "Documentation"',
  ].join('\n');
  const cli = new FakeBskCli((args) => {
    if (args[0] === 'open') {
      return {
        session_id: 'session-1',
        tab_id: 7,
        url: 'https://example.com/',
        vom: '@vom 1\n  @e1 link "Learn more"',
      };
    }
    if (args[0] === 'step') {
      return {
        ok: true,
        phase: 'observed',
        action: { result: { used_ref: 'e1' } },
        post: { observation: { tab_id: 7, text: next } },
      };
    }
    if (args[0] === 'tab') {
      return {
        tabs: [{
          tab_id: 7,
          title: 'Documentation',
          url: 'https://example.com/docs',
          active: true,
        }],
      };
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  });
  const browser = new BskBackend({ cli, scope: 'test' });

  await browser.open('https://example.com');
  const acted = await browser.actAndObserve('CLICK', { target: '@e1' });

  assert.equal(acted.actionResult.effect, 'settled');
  assert.equal(acted.observation.url, 'https://example.com/docs');
  assert.equal(acted.observation.refs['@e1'].name, 'Documentation');
  assert.deepEqual(cli.calls.map((args) => args[0]), ['open', 'step', 'tab']);
});

test('BSK partial step reconciles with sync without replaying the action', async () => {
  const next = [
    '@vom 1',
    '  @e1 link "Documentation"',
  ].join('\n');
  const cli = new FakeBskCli((args) => {
    if (args[0] === 'open') {
      return {
        session_id: 'session-1',
        tab_id: 7,
        url: 'https://example.com/',
        vom: '@vom 1\n  @e1 link "Learn more"',
      };
    }
    if (args[0] === 'step') {
      return {
        ok: false,
        phase: 'needs_attention',
        action: { result: { used_ref: 'e1' } },
        post: { observation: { tab_id: 7, text: '@vom 1\n  @e1 link "Old state"' } },
      };
    }
    if (args[0] === 'sync') return { vom: next, tab_id: 7 };
    if (args[0] === 'tab') {
      return {
        tabs: [{
          tab_id: 7,
          title: 'Documentation',
          url: 'https://example.com/docs',
          active: true,
        }],
      };
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  }, { stepExitCode: 1 });
  const browser = new BskBackend({ cli, scope: 'test' });

  await browser.open('https://example.com');
  const acted = await browser.actAndObserve('CLICK', { target: '@e1' });

  assert.equal(acted.actionResult.effect, 'observed-after-reconcile');
  assert.equal(acted.observation.url, 'https://example.com/docs');
  assert.deepEqual(cli.calls.map((args) => args[0]), ['open', 'step', 'sync', 'tab']);
  assert.equal(cli.calls.filter((args) => args[0] === 'click').length, 0);
});

test('BSK partial step without a usable observation fails as EFFECT_UNKNOWN', async () => {
  const cli = new FakeBskCli((args) => {
    if (args[0] === 'open') {
      return {
        session_id: 'session-1',
        tab_id: 7,
        url: 'https://example.com/',
        vom: '@vom 1\n  @e1 link "Learn more"',
      };
    }
    if (args[0] === 'step') {
      return {
        ok: false,
        phase: 'needs_attention',
        action: { result: { used_ref: 'e1' } },
      };
    }
    if (args[0] === 'sync') throw new Error('sync unavailable');
    throw new Error(`unexpected command: ${args.join(' ')}`);
  }, { stepExitCode: 1 });
  const browser = new BskBackend({
    cli,
    scope: 'test',
    settleTimeoutMs: 1,
    sleepImpl: async () => {},
  });

  await browser.open('https://example.com');
  await assert.rejects(
    () => browser.actAndObserve('CLICK', { target: '@e1' }),
    (error) => error.code === 'EFFECT_UNKNOWN',
  );
  assert.equal(cli.calls.filter((args) => args[0] === 'click').length, 0);
});

test('BSK step failure without an action result is EFFECT_UNKNOWN', async () => {
  const cli = new FakeBskCli((args) => {
    if (args[0] === 'open') {
      return {
        session_id: 'session-1',
        tab_id: 7,
        url: 'https://example.com/',
        vom: '@vom 1\n  @e1 link "Learn more"',
      };
    }
    if (args[0] === 'step') return { ok: false, phase: 'failed' };
    throw new Error(`unexpected command: ${args.join(' ')}`);
  }, { stepExitCode: 1 });
  const browser = new BskBackend({ cli, scope: 'test' });

  await browser.open('https://example.com');
  await assert.rejects(
    () => browser.actAndObserve('CLICK', { target: '@e1' }),
    (error) => error.code === 'EFFECT_UNKNOWN' && error.effectState === 'unknown',
  );
  assert.equal(cli.calls.filter((args) => args[0] === 'click').length, 0);
});

test('BSK step with an unverifiable tab URL is EFFECT_UNKNOWN', async () => {
  const cli = new FakeBskCli((args) => {
    if (args[0] === 'open') {
      return {
        session_id: 'session-1',
        tab_id: 7,
        url: 'https://example.com/',
        vom: '@vom 1\n  @e1 link "Learn more"',
      };
    }
    if (args[0] === 'step') {
      return {
        ok: true,
        phase: 'observed',
        action: { result: { used_ref: 'e1' } },
        post: { observation: { tab_id: 7, text: '@vom 1\n  @e1 link "Next"' } },
      };
    }
    if (args[0] === 'tab') throw new Error('tab list unavailable');
    throw new Error(`unexpected command: ${args.join(' ')}`);
  });
  const browser = new BskBackend({ cli, scope: 'test' });

  await browser.open('https://example.com');
  await assert.rejects(
    () => browser.actAndObserve('CLICK', { target: '@e1' }),
    (error) => error.code === 'EFFECT_UNKNOWN',
  );
});

test('BSK actAndObserve falls back for operations without a step mapping', async () => {
  const cli = new FakeBskCli((args) => {
    if (args[0] === 'open') {
      return {
        session_id: 'session-1',
        tab_id: 7,
        url: 'https://example.com/',
        vom: '@vom 1\n  @e1 link "Learn more"',
      };
    }
    if (args[0] === 'wheel') return { ok: true };
    if (args[0] === 'sync') {
      return { vom: '@vom 1\n  @e1 link "Learn more"', tab_id: 7 };
    }
    if (args[0] === 'tab') {
      return {
        tabs: [{
          tab_id: 7,
          title: 'Example',
          url: 'https://example.com/',
          active: true,
        }],
      };
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  });
  const browser = new BskBackend({ cli, scope: 'test' });

  await browser.open('https://example.com');
  const acted = await browser.actAndObserve('SCROLL_DOWN');

  assert.equal(acted.actionResult.effect, 'settled');
  assert.deepEqual(cli.calls.map((args) => args[0]), ['open', 'wheel', 'sync', 'tab']);
});

test('BSK step commands use the documented protocol parameter fields', () => {
  const browser = new BskBackend({ cli: new FakeBskCli(), scope: 'test' });

  assert.deepEqual(stepParams(browser, 'CLICK', { target: '@e1' }), { ref: '@e1' });
  assert.deepEqual(stepParams(browser, 'TYPE', { target: '@e2', value: 'hello' }), {
    ref: '@e2',
    value: 'hello',
  });
  assert.deepEqual(stepParams(browser, 'SELECT', { target: '@e3', value: 'us' }), {
    ref: '@e3',
    values: ['us'],
  });
  assert.deepEqual(stepParams(browser, 'PRESS', { value: 'Enter' }), { key: 'Enter' });
  assert.deepEqual(stepParams(browser, 'NAVIGATE', {
    value: 'https://example.com/next',
  }), { url: 'https://example.com/next' });
});

test('BSK step rejects a stale target before dispatch', async () => {
  const cli = new FakeBskCli();
  const browser = new BskBackend({ cli, scope: 'test' });
  browser.lastObservation = normalizeObservation({
    url: 'https://example.com/',
    snapshot: '@vom 1\n  @e1 button "Continue"',
  });

  await assert.rejects(
    () => browser.actAndObserve('CLICK', { target: '@e99' }),
    (error) => error.code === 'STALE_TARGET',
  );
  assert.equal(cli.calls.length, 0);
});

test('BSK CLI preserves JSON from a nonzero step result', async () => {
  const processError = new BrowsemuxError('bsk exited with code 1', {
    code: 'PROCESS_EXIT',
    details: {
      exitCode: 1,
      stdout: JSON.stringify({
        ok: false,
        phase: 'needs_attention',
        action: { result: { used_ref: 'e1' } },
      }),
      stderr: '',
    },
  });
  const cli = new BskCli({
    command: 'bsk',
    runProcessImpl: async () => {
      throw processError;
    },
  });

  const result = await cli.runAllowFailure(['step']);

  assert.equal(result.exitCode, 1);
  assert.equal(result.payload.action.result.used_ref, 'e1');
  assert.equal(result.processError, processError);
});

test('BSK process timeout without JSON becomes EFFECT_UNKNOWN', async () => {
  const cli = new FakeBskCli((args) => {
    if (args[0] === 'open') {
      return {
        session_id: 'session-1',
        tab_id: 7,
        url: 'https://example.com/',
        vom: '@vom 1\n  @e1 link "Learn more"',
      };
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  });
  cli.runAllowFailure = async () => {
    throw new BrowsemuxError('bsk timed out', { code: 'PROCESS_TIMEOUT' });
  };
  const browser = new BskBackend({ cli, scope: 'test' });

  await browser.open('https://example.com');
  await assert.rejects(
    () => browser.actAndObserve('CLICK', { target: '@e1' }),
    (error) => error.code === 'EFFECT_UNKNOWN',
  );
});

class FakeBskCli {
  constructor(handler = () => ({}), { stepExitCode = 0 } = {}) {
    this.handler = handler;
    this.calls = [];
    this.stepExitCode = stepExitCode;
  }

  async run(args) {
    this.calls.push(args);
    return this.handler(args);
  }

  async runAllowFailure(args) {
    this.calls.push(args);
    const payload = this.handler(args);
    return {
      payload,
      exitCode: args[0] === 'step' ? this.stepExitCode : 0,
      stderr: '',
    };
  }
}

function stepParams(browser, operation, options) {
  const command = browser.stepCommand(operation, options);
  assert.equal(command[0], 'step');
  return JSON.parse(command[command.indexOf('--params') + 1]);
}
