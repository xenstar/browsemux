import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInputs } from '../src/inputs.mjs';
import { runLoop } from '../src/loop.mjs';

const firstPage = {
  backend: 'fake',
  url: 'https://example.com/',
  title: 'Start',
  snapshot: '- button "Continue"',
  refs: {
    '@e1': { role: 'button', name: 'Continue' },
  },
};

const finalPage = {
  backend: 'fake',
  url: 'https://example.com/done',
  title: 'Done',
  snapshot: '- heading "Complete"',
  refs: {},
};

test('executes one validated action and returns an unverified completion proposal', async () => {
  const browser = new FakeBrowser([finalPage]);
  const provider = new SequenceProvider([
    { proposal: { operation: 'CLICK', target: '@e1', confidence: 0.9 } },
    { proposal: { operation: 'DONE', confidence: 0.8 } },
  ]);

  const result = await runLoop({
    goal: 'Continue',
    browser,
    provider,
    initialObservation: firstPage,
    maxSteps: 4,
  });

  assert.equal(result.status, 'completed-unverified');
  assert.equal(result.actionCount, 1);
  assert.equal(browser.actions.length, 1);
  assert.equal(result.observation.url, 'https://example.com/done');
  assert.equal(result.handoff.needsVerification, true);
});

test('rejects a stale proposal and asks for another decision without acting', async () => {
  const browser = new FakeBrowser([]);
  const provider = new SequenceProvider([
    { proposal: { operation: 'CLICK', target: '@e99' } },
    { proposal: { operation: 'DONE' } },
  ]);

  const result = await runLoop({
    goal: 'Continue',
    browser,
    provider,
    initialObservation: firstPage,
    maxSteps: 4,
  });

  assert.equal(result.status, 'completed-unverified');
  assert.equal(browser.actions.length, 0);
  assert.equal(provider.calls, 2);
  assert.ok(result.history.some((entry) => entry.reason === 'STALE_TARGET'));
});

test('uses deterministic success criteria instead of trusting DONE', async () => {
  const browser = new FakeBrowser([]);
  const provider = new SequenceProvider([]);
  const initialObservation = {
    ...firstPage,
    url: 'https://example.com/complete',
    snapshot: 'Thanks, the operation is complete.',
  };

  const result = await runLoop({
    goal: 'Finish the operation',
    browser,
    provider,
    initialObservation,
    successCriteria: {
      urlContains: '/complete',
      textContains: 'operation is complete',
    },
    maxSteps: 2,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.actionCount, 0);
  assert.equal(provider.calls, 0);
});

test('uses supplied text without exposing it to the provider', async () => {
  const secondPage = {
    ...firstPage,
    snapshot: '- textbox "Search"',
    refs: {
      '@e2': { role: 'textbox', name: 'Search' },
    },
  };
  const browser = new FakeBrowser([secondPage]);
  let observedInputs;
  const provider = {
    name: 'fake',
    calls: 0,
    async decide({ inputs }) {
      this.calls += 1;
      observedInputs = inputs;
      return {
        proposal: {
          operation: 'TYPE',
          target: '@e2',
          inputKey: 'query',
        },
      };
    },
  };

  const result = await runLoop({
    goal: 'Search',
    browser,
    provider,
    inputs: normalizeInputs({ text: { query: 'Browsemux' } }),
    initialObservation: {
      ...firstPage,
      snapshot: '- textbox "Search"',
      refs: {
        '@e2': { role: 'textbox', name: 'Search' },
      },
    },
    maxSteps: 1,
  });

  assert.equal(result.status, 'limit');
  assert.equal(observedInputs.entries[0].value, 'Browsemux');
  assert.deepEqual(browser.actions[0].payload.value, 'Browsemux');
});

test('uses an atomic act-and-observe result for immediate deterministic success', async () => {
  const atomicPage = {
    ...firstPage,
    url: 'https://example.com/complete',
    snapshot: '- heading "Complete"',
    refs: {},
  };
  const browser = new FakeBrowser([]);
  browser.actAndObserve = async () => ({
    actionResult: { dispatched: true, effect: 'settled', settledUrl: atomicPage.url },
    observation: atomicPage,
  });
  const provider = new SequenceProvider([
    { proposal: { operation: 'CLICK', target: '@e1' } },
  ]);

  const result = await runLoop({
    goal: 'Continue until complete',
    browser,
    provider,
    initialObservation: firstPage,
    successCriteria: { urlContains: '/complete' },
    maxSteps: 1,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.completedAtStep, 1);
  assert.equal(browser.actions.length, 0);
  assert.equal(browser.snapshots.length, 0);
});

class FakeBrowser {
  constructor(snapshots = []) {
    this.name = 'fake';
    this.snapshots = [...snapshots];
    this.actions = [];
  }

  async snapshot() {
    if (!this.snapshots.length) return this.lastActionResult ?? finalPage;
    return this.snapshots.shift();
  }

  async action(operation, payload) {
    this.actions.push({ operation, payload });
    this.lastActionResult = this.snapshots[0] ?? finalPage;
    return { dispatched: true, effect: 'observed-next' };
  }
}

class SequenceProvider {
  constructor(decisions) {
    this.name = 'sequence';
    this.decisions = [...decisions];
    this.calls = 0;
  }

  async decide() {
    this.calls += 1;
    const next = this.decisions.shift();
    if (!next) throw new Error('No scripted decision remains');
    return next;
  }
}
