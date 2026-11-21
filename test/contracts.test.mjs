import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deterministicSuccess,
  semanticSignature,
  validateProposal,
} from '../src/contracts.mjs';
import { normalizeInputs } from '../src/inputs.mjs';

const observation = {
  url: 'https://example.com/',
  title: 'Example',
  snapshot: 'button "Continue"',
  refs: {
    '@e1': { role: 'button', name: 'Continue' },
    '@e2': { role: 'textbox', name: 'Search' },
  },
};

const inputs = normalizeInputs({
  text: {
    query: 'browser automation',
  },
});

test('accepts and normalizes a bounded click proposal', () => {
  const validated = validateProposal({
    operation: 'CLICK',
    target: '@e1',
  }, observation, inputs);

  assert.equal(validated.operation, 'CLICK');
  assert.equal(validated.target, '@e1');
  assert.equal(validated.inputKey, null);
  assert.equal(semanticSignature(validated, observation), 'CLICK|button:continue|');
});

test('accepts a text proposal only with a supplied input', () => {
  const validated = validateProposal({
    operation: 'TYPE',
    target: '@e2',
    inputKey: 'query',
  }, observation, inputs);

  assert.equal(validated.input.value, 'browser automation');
  assert.equal(validated.input.secret, false);
});

test('rejects a stale target before execution', () => {
  assert.throws(
    () => validateProposal({ operation: 'CLICK', target: '@e99' }, observation, inputs),
    (error) => error.code === 'STALE_TARGET',
  );
});

test('rejects a target with an incompatible role', () => {
  assert.throws(
    () => validateProposal({ operation: 'CLICK', target: '@e2' }, observation, inputs),
    (error) => error.code === 'INVALID_TARGET_ROLE',
  );
});

test('accepts only deterministic success criteria', () => {
  assert.equal(deterministicSuccess(observation, {}), false);
  assert.equal(deterministicSuccess(observation, { urlContains: 'example.com' }), true);
  assert.equal(deterministicSuccess(observation, {
    urlContains: 'example.com',
    textContains: 'missing',
  }), false);
});
