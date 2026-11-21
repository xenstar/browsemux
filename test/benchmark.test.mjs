import test from 'node:test';
import assert from 'node:assert/strict';
import { runDirectHarness } from '../bench/direct-harness.mjs';
import { renderFixturePage } from '../bench/fixture-server.mjs';
import { normalizeUsage, percentile, summarizeBenchmark } from '../bench/report.mjs';
import { parseBenchmarkArgs, withModelRetries } from '../bench/runner.mjs';
import { normalizeInputs } from '../src/inputs.mjs';

test('direct harness keeps a cumulative conversation and verifies success', async () => {
  const pages = {
    '/': observation('/', 'Journey start', [
      ['@e1', { role: 'link', name: 'Continue' }],
    ]),
    '/step-2': observation('/step-2', 'Journey step two', [
      ['@e1', { role: 'link', name: 'Finish' }],
    ]),
    '/complete': observation('/complete', 'Journey complete', [], 'Journey complete'),
  };
  const browser = new FakeBrowser(pages);
  const provider = new SequenceDirectProvider([
    directDecision('CLICK', '@e1'),
    directDecision('CLICK', '@e1'),
  ]);

  const result = await runDirectHarness({
    goal: 'Finish the journey',
    browser,
    provider,
    inputs: normalizeInputs(),
    maxSteps: 4,
    successCriteria: { urlContains: '/complete' },
    initialObservation: pages['/'],
  });

  assert.equal(result.status, 'success');
  assert.equal(result.actionCount, 2);
  assert.equal(result.modelCalls, 2);
  assert.deepEqual(provider.messageCounts, [2, 4]);
  assert.equal(result.usage.prompt_tokens, 22);
  assert.equal(result.usage.completion_tokens, 6);
});

test('fixture server renders deterministic task pages', () => {
  const page = renderFixturePage(new URL('http://fixture.test/results?q=Aurora'));
  assert.equal(page.status, 200);
  assert.match(page.html, /Query: Aurora/);
});

test('benchmark report normalizes usage and computes relative efficiency', () => {
  assert.deepEqual(normalizeUsage({
    input_tokens: 10,
    output_tokens: 2,
    cached_tokens: 3,
    cost: 0.001,
  }), {
    inputTokens: 10,
    outputTokens: 2,
    cachedTokens: 3,
    totalTokens: null,
    costUsd: 0.001,
  });
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);

  const report = summarizeBenchmark([
    runRecord('direct', 100, 1_000, 0.01, true),
    runRecord('browsemux', 80, 900, 0.005, true),
  ]);

  assert.equal(report.overall.length, 2);
  assert.equal(report.relative[0].medianInputTokens, -0.2);
  assert.equal(report.relative[0].medianWallMs, -0.1);
  assert.equal(report.relative[0].costPerVerifiedTask, -0.5);
});

test('benchmark argument parser keeps the same model for both arms', () => {
  const options = parseBenchmarkArgs([
    '--model', 'example/model',
    '--tasks', 'open-link,search-form',
    '--backends', 'agent-browser',
    '--repeats', '3',
    '--model-retries', '1',
    '--no-write',
  ], { cwd: 'G:\\opencode\\projects\\Search\\browsemux' });

  assert.equal(options.model, 'example/model');
  assert.deepEqual(options.tasks, ['open-link', 'search-form']);
  assert.deepEqual(options.backends, ['agent-browser']);
  assert.equal(options.repeats, 3);
  assert.equal(options.modelRetries, 1);
  assert.equal(options.noWrite, true);
});

test('benchmark retries only transient model transport failures', async () => {
  let calls = 0;
  const provider = {
    name: 'fake-model',
    model: 'fake/model',
    async decide() {
      calls += 1;
      if (calls === 1) throw new Error('fetch failed');
      return { proposal: { operation: 'DONE' } };
    },
  };
  const wrapped = withModelRetries(provider, {
    maxRetries: 2,
    sleepImpl: async () => {},
  });

  const result = await wrapped.decide();

  assert.equal(result.proposal.operation, 'DONE');
  assert.equal(calls, 2);
  assert.equal(wrapped.retries.count, 1);
});

class FakeBrowser {
  constructor(pages) {
    this.name = 'fake';
    this.pages = pages;
    this.current = pages['/'];
  }

  async snapshot() {
    return this.current;
  }

  async action() {
    throw new Error('not used');
  }

  async actAndObserve(operation, { target }) {
    assert.equal(operation, 'CLICK');
    assert.equal(target, '@e1');
    this.current = this.current.url === '/'
      ? this.pages['/step-2']
      : this.pages['/complete'];
    return {
      actionResult: {
        dispatched: true,
        effect: 'settled',
        settledUrl: this.current.url,
      },
      observation: this.current,
    };
  }
}

class SequenceDirectProvider {
  constructor(decisions) {
    this.name = 'direct:fake';
    this.decisions = [...decisions];
    this.messageCounts = [];
  }

  async decide({ messages }) {
    this.messageCounts.push(messages.length);
    const next = this.decisions.shift();
    return {
      content: next.content,
      proposal: next.proposal,
      usage: {
        prompt_tokens: 11,
        completion_tokens: 3,
        total_tokens: 14,
        cost: 0.00001,
      },
      latencyMs: 10,
      requestChars: JSON.stringify(messages).length,
    };
  }
}

function observation(url, title, refs, text = title) {
  return {
    backend: 'fake',
    url,
    title,
    snapshot: `- ${text}`,
    refs: Object.fromEntries(refs),
    metadata: {},
  };
}

function directDecision(operation, target) {
  return {
    content: JSON.stringify({ operation, target, inputKey: null, confidence: 0.9 }),
    proposal: { operation, target, inputKey: null, confidence: 0.9 },
  };
}

function runRecord(arm, inputTokens, wallMs, cost, success) {
  return {
    taskId: 'one',
    backend: 'agent-browser',
    arm,
    success,
    wallMs: { total: wallMs },
    timings: { decisionMs: 50, observationMs: 25, actionMs: 25 },
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: 10,
      total_tokens: inputTokens + 10,
      cost,
    },
    modelCalls: 1,
    modelRetries: 0,
    browserCommands: 4,
    actions: 1,
    invalidActions: 0,
  };
}
