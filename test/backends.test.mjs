import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSnapshot } from '../src/backends/agent-browser.mjs';
import {
  BskBackend,
  normalizeObservation,
  parseBskRefs,
} from '../src/backends/bsk.mjs';

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

class FakeBskCli {
  constructor(handler = () => ({})) {
    this.handler = handler;
    this.calls = [];
  }

  async run(args) {
    this.calls.push(args);
    return this.handler(args);
  }
}
